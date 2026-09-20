// SPDX-License-Identifier: Apache-2.0
/**
 * Reading an MSVC link error and finding which library defines the symbol it names.
 *
 * MS documents what LNK2019 means and lists eighteen ways to cause it, but the one thing
 * the docs cannot know is what is installed here. Their own advice is to run dumpbin over
 * your libraries by hand. That is what this does, except it reads the symbol indexes
 * directly, so the answer takes under a second instead of 1,500 processes.
 *
 * Nothing here imports vscode, so the parsing is testable without an editor.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readSymbolNames } = require('./ar');

// Shorter than this and a word out of a message is as likely a match as a real symbol.
// Symbols this short exist; they are not worth what they drag in.
const MIN_TOKEN = 4;

// The error code is the only part of a linker message that reads the same in every UI
// language, so the whole parse hangs off it rather than off any wording around it.
const ERROR_LINE = /\berror\s+LNK(2019|2001)\b/;
// MSVC decorated names begin with '?', and the linker prints them in parentheses.
const DECORATED = /\((\?[^)]+)\)/g;
const TOKEN = /[A-Za-z_$@?][A-Za-z0-9_$@?.]*/g;
// The words an English linker message is made of. Dropping them is not a language
// assumption: a Korean or Japanese message never contains them, so it loses nothing, while
// an English one stops offering "unresolved" as a candidate longer than a short C symbol.
const STOPWORDS = new Set(['unresolved', 'external', 'symbol', 'symbols', 'referenced', 'function', 'fatal', 'error']);

/**
 * @param {string} text linker output, in any UI language
 * @returns {{code: string, line: string, decorated: string[], tokens: string[]}[]}
 */
function parseErrors(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = ERROR_LINE.exec(raw);
    if (!m) continue;
    // Everything before the code is the object or library that referenced the symbol, and
    // its file name would otherwise look exactly like a symbol to the token pass.
    const rest = raw.slice(m.index + m[0].length);
    const decorated = [...rest.matchAll(DECORATED)].map((x) => x[1]);
    // The decorated name and the human-readable signature beside it say the same thing, so
    // drop both before looking for a plain C name in what is left.
    const plain = rest.replace(/\([^)]*\)/g, ' ').replace(/"[^"]*"/g, ' ');
    const tokens = [...plain.matchAll(TOKEN)]
      .map((x) => x[0])
      .filter((t) => t.length >= MIN_TOKEN && !STOPWORDS.has(t.toLowerCase()));
    out.push({ code: `LNK${m[1]}`, line: raw.trim(), decorated, tokens });
  }
  return out;
}

/** @param {string[]} tokens @returns {string|null} */
function longest(tokens) {
  let best = null;
  for (const t of tokens) if (!best || t.length > best.length) best = t;
  return best;
}

/**
 * A decorated name is exact. A plain C name is not: in Korean the linker writes
 * "symbolmain 함수에서 참조되는..." with nothing between the symbol and the function that
 * referenced it, because the English " referenced in function " is an empty string there.
 * Rather than guess where the seam falls, offer every prefix and let the archives decide —
 * whatever something actually defines is the symbol. When nothing matches, the symbol is
 * missing everywhere anyway, which is the same answer the seam would have led to.
 *
 * Only the first name on the line is offered, and a line carrying a decorated name offers
 * only that. Whatever follows is the function that made the reference — English puts it
 * after "referenced in function", Korean simply runs it onto the end — and against an
 * index of 450,000 symbols an ordinary word finds something. "main" is defined in clang's
 * fuzzer libraries, so looking up every word answered a missing function with a library
 * that had nothing to do with it, which is worse than not answering.
 * @param {ReturnType<typeof parseErrors>} errors
 * @returns {Set<string>}
 */
function candidates(errors) {
  const wanted = new Set();
  for (const e of errors) {
    if (e.decorated.length) {
      for (const s of e.decorated) wanted.add(s);
      continue;
    }
    const t = e.tokens[0];
    if (t) for (let n = MIN_TOKEN; n <= t.length; n++) wanted.add(t.slice(0, n));
  }
  return wanted;
}

/**
 * @param {string[]} files archives to look in
 * @param {Set<string>} wanted
 * @param {(done: number, total: number) => void} [onProgress] called as the scan advances
 * @returns {Promise<Map<string, string[]>>} symbol -> archives defining it
 */
async function scan(files, wanted, onProgress) {
  const hits = new Map();
  for (let i = 0; i < files.length; i++) {
    let names;
    try {
      names = readSymbolNames(files[i]);
    } catch {
      continue; // a stray file that is not an archive is not worth failing the scan over
    }
    for (const n of names) {
      if (!wanted.has(n)) continue;
      if (!hits.has(n)) hits.set(n, []);
      hits.get(n).push(files[i]);
    }
    // The reads are synchronous, so without this the whole extension host sits still for
    // the length of the scan — about a second warm, and once measured at twelve.
    if (i % 100 === 99) {
      onProgress?.(i + 1, files.length);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  onProgress?.(files.length, files.length);
  return hits;
}

/**
 * @param {string} text linker output
 * @param {string[]} files archives to look in
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{code: string, line: string, symbol: string, libs: string[]}[]>}
 */
async function decode(text, files, onProgress) {
  const errors = parseErrors(text);
  const wanted = candidates(errors);
  const hits = wanted.size ? await scan(files, wanted, onProgress) : new Map();

  return errors.map((e) => {
    const base = { code: e.code, line: e.line };
    if (e.decorated.length) {
      const name = e.decorated[0];
      return { ...base, symbol: name, libs: hits.get(name) || [] };
    }
    // Longest prefix first: the seam is wherever the archives stop recognising the name.
    const t = e.tokens[0];
    if (t) {
      for (let n = t.length; n >= MIN_TOKEN; n--) {
        const p = t.slice(0, n);
        if (hits.has(p)) return { ...base, symbol: p, libs: hits.get(p) };
      }
    }
    // Nothing defines it, so the seam never mattered. Name it by the longest thing on the
    // line, which in Korean still has the referencing function stuck to it.
    return { ...base, symbol: longest(e.tokens) || e.line, libs: [] };
  });
}

/** @param {string} dir @returns {string[]} full paths of the subdirectories of dir */
function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Version folders sort as numbers, or 10.0.9 would beat 10.0.26100. */
function newest(list) {
  const sorted = list.slice().sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/**
 * The lib directories MSVC and the Windows SDK lay down, found by walking their fixed
 * layout rather than by running vswhere: the point of this extension is that it answers
 * with nothing installed beyond what is being asked about.
 * ponytail: newest version of each product only. Add a setting if someone pins an old SDK.
 * @returns {string[]}
 */
function libDirs() {
  const dirs = [];
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    for (const year of subdirs(path.join(root, 'Microsoft Visual Studio'))) {
      for (const edition of subdirs(year)) {
        const msvc = newest(subdirs(path.join(edition, 'VC', 'Tools', 'MSVC')));
        if (msvc) dirs.push(...subdirs(path.join(msvc, 'lib')));
      }
    }
    const kit = newest(subdirs(path.join(root, 'Windows Kits', '10', 'Lib')));
    // um, ucrt and the enclave variants, each split by architecture. Keeping every
    // architecture is what makes a 64-bit/32-bit mismatch visible instead of invisible.
    if (kit) for (const group of subdirs(kit)) dirs.push(...subdirs(group));
  }
  return dirs;
}

/** @param {string[]} dirs @returns {string[]} the archives directly inside them */
function listLibs(dirs) {
  const out = [];
  for (const d of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) if (e.isFile() && /\.(lib|a)$/i.test(e.name)) out.push(path.join(d, e.name));
  }
  return out;
}

/**
 * One line per library rather than one per file. A Win32 symbol lives in the same library
 * built for every architecture, so the raw list is two dozen paths saying three things;
 * folded this way the architectures become the useful part — a symbol present only under
 * x86 is the 32-bit/64-bit mismatch that LNK2019 is otherwise silent about.
 *
 * These paths are always Windows paths — they come from the SDK and MSVC directories — so
 * split them with `path.win32` rather than the host's separator. On Windows the two are the
 * same call; off Windows it is the difference between a name and the whole path.
 * @param {string[]} libs @returns {{name: string, where: string[]}[]}
 */
function groupLibs(libs) {
  const byName = new Map();
  for (const f of libs) {
    const name = path.win32.basename(f);
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, where: [] });
    byName.get(key).where.push(path.win32.basename(path.win32.dirname(f)));
  }
  return [...byName.values()];
}

module.exports = { parseErrors, candidates, scan, decode, libDirs, listLibs, groupLibs };
