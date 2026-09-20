// SPDX-License-Identifier: Apache-2.0
/**
 * Reading a link error and finding which library defines the symbol it names.
 *
 * MS documents what LNK2019 means and lists eighteen ways to cause it, but the one thing
 * the docs cannot know is what is installed here. Their own advice is to run dumpbin over
 * your libraries by hand. That is what this does, except it reads the symbol indexes
 * directly, so the answer takes under a second instead of 1,500 processes.
 *
 * GNU ld and lld ask the same question in the other direction. MSVC prints the decorated
 * name and leaves the reading to you; they demangle and leave the lookup to you, since
 * `ns::deep(double)` matches nothing in an index full of `_ZN2ns4deepEd`. mangle.js rebuilds
 * the front of the mangled name, so the lookup becomes a prefix match over the same scan.
 *
 * Nothing here imports vscode, so the parsing is testable without an editor.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readSymbolNames } = require('./ar');
const { manglePrefix } = require('./mangle');

// Shorter than this and a word out of a message is as likely a match as a real symbol.
// Symbols this short exist; they are not worth what they drag in.
const MIN_TOKEN = 4;

// The error code is the only part of a linker message that reads the same in every UI
// language, so the whole parse hangs off it rather than off any wording around it.
const ERROR_LINE = /\berror\s+LNK(2019|2001)\b/;
// GNU ld fences the name in a backtick and a quote, which is what makes this parse exact
// where the MSVC one has to guess at a seam: `undefined reference to `ns::deep(double)''.
const GNU_REFERENCE = /undefined reference to `([^']+)'/;
// lld runs the name to the end of the line instead: "ld.lld: error: undefined symbol: main".
const LLD_SYMBOL = /undefined symbol:\s*(\S.*?)\s*$/;
// MSVC decorated names begin with '?', and the linker prints them in parentheses.
const DECORATED = /\((\?[^)]+)\)/g;
const TOKEN = /[A-Za-z_$@?][A-Za-z0-9_$@?.]*/g;
// The words an English linker message is made of. Dropping them is not a language
// assumption: a Korean or Japanese message never contains them, so it loses nothing, while
// an English one stops offering "unresolved" as a candidate longer than a short C symbol.
const STOPWORDS = new Set(['unresolved', 'external', 'symbol', 'symbols', 'referenced', 'function', 'fatal', 'error']);

/**
 * @param {string} text linker output, in any UI language
 * @returns {{code: string, line: string, decorated: string[], tokens: string[], gnu?: string}[]}
 *   `gnu` holds the name as GNU ld or lld demangled it, on the lines that carry one.
 */
function parseErrors(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    // A GNU line names the symbol outright, so it needs none of the token guessing below.
    const g = GNU_REFERENCE.exec(raw) || LLD_SYMBOL.exec(raw);
    if (g) {
      out.push({ code: 'ld', line: raw.trim(), decorated: [], tokens: [], gnu: g[1].trim() });
      continue;
    }
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
 * A GNU line needs none of that — the name is fenced in quotes — but it needs the opposite
 * favour undone. `ns::deep(double)` is in no index; `_ZN2ns4deepE` is the front of the one
 * that is, so it goes in as a prefix rather than a name. `comps` carries the same name as
 * its parts in order, for the mangled names whose front cannot be rebuilt: a template class
 * writes its arguments into the middle of its own name, so the parts are all still there
 * with other things between them.
 * @param {ReturnType<typeof parseErrors>} errors
 * @returns {{exact: Set<string>, prefixes: string[], comps: string[][]}}
 */
function candidates(errors) {
  const exact = new Set();
  const prefixes = new Set();
  const comps = new Map();
  for (const e of errors) {
    if (e.gnu) {
      const m = manglePrefix(e.gnu);
      if (!m) continue;
      if (m.plain) exact.add(m.plain);
      else {
        prefixes.add(m.prefix);
        comps.set(m.comps.join('\u0000'), m.comps);
      }
      continue;
    }
    if (e.decorated.length) {
      for (const s of e.decorated) exact.add(s);
      continue;
    }
    const t = e.tokens[0];
    if (t) for (let n = MIN_TOKEN; n <= t.length; n++) exact.add(t.slice(0, n));
  }
  return { exact, prefixes: [...prefixes], comps: [...comps.values()] };
}

/** @param {ReturnType<typeof candidates>} w */
function isEmpty(w) {
  return !w.exact.size && !w.prefixes.length && !w.comps.length;
}

/**
 * Whether every component appears in the mangled name, in order. This is what a prefix
 * match degrades into once a template argument lands in the middle of a name:
 * `_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE6appendEPKc` still spells
 * `12basic_string` and then `6append`, with the argument list between them.
 * @param {string} mangled @param {string[]} comps
 */
function hasComponents(mangled, comps) {
  let i = 0;
  for (const c of comps) {
    i = mangled.indexOf(c, i);
    if (i < 0) return false;
    i += c.length;
  }
  return true;
}

/**
 * What the scan collects, which is deliberately looser than what decode will accept: a
 * name starting with `_ZN2ns4deepE` contains those components in order by construction, so
 * the component test alone gathers everything the prefix test would, and the prefix belongs
 * in the judging rather than here.
 *
 * Only mangled names are worth walking the components for, and every mangled name begins
 * `_Z`. In an index of 450,000 symbols that test rejects nearly all of them before a single
 * string comparison runs.
 * @param {string} n @param {ReturnType<typeof candidates>} w
 */
function matches(n, w) {
  if (w.exact.has(n)) return true;
  if (n.charCodeAt(0) !== 0x5f || n.charCodeAt(1) !== 0x5a) return false; // '_Z'
  for (const c of w.comps) if (hasComponents(n, c)) return true;
  return false;
}

/**
 * @param {string[]} files archives to look in
 * @param {ReturnType<typeof candidates>} wanted
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
      if (!matches(n, wanted)) continue;
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
  const hits = isEmpty(wanted) ? new Map() : await scan(files, wanted, onProgress);

  return errors.map((e) => {
    const base = { code: e.code, line: e.line };
    // The name GNU printed is the readable one, and it stays the one reported: nobody
    // searching their code for the problem is looking for `_ZN2ns4deepEd`.
    if (e.gnu) {
      const m = manglePrefix(e.gnu);
      // An operator, whose mangled form spells no name at all. Reporting it as absent would
      // be reporting a conclusion this never reached.
      if (!m) return { ...base, symbol: e.gnu, libs: [], unknown: true };
      if (m.plain) return { ...base, symbol: m.plain, libs: hits.get(m.plain) || [] };

      // Every overload shares the prefix, and any of them is a reason to link the library.
      const libs = new Set();
      for (const [name, where] of hits) {
        if (name.startsWith(m.prefix)) for (const w of where) libs.add(w);
      }
      // Only when the rebuilt front matched nothing is the looser test worth its false
      // positives — otherwise a name that merely contains the same components, in another
      // namespace, would join a real answer. Measured over libstdc++'s 7,204 mangled
      // symbols: the prefix places 37.8% exactly, components place another 46.8%, and those
      // drag in 20.7 unrelated symbols each, which is why they only run as a fallback.
      if (!libs.size) {
        for (const [name, where] of hits) {
          if (hasComponents(name, m.comps)) for (const w of where) libs.add(w);
        }
      }
      return { ...base, symbol: e.gnu, libs: [...libs] };
    }
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

// The programs that mean "a GNU-style toolchain lives one folder up from here". Looking
// for the driver rather than for a folder called mingw64 is what makes this work for
// WinLibs, MSYS2, a Chocolatey install and a linux container alike: none of them agree on
// the name of the root, and all of them put the driver on PATH.
const GNU_DRIVERS = ['gcc', 'g++', 'clang', 'ld'];

/** @returns {string[]} the folders holding a GNU toolchain's bin directory */
function toolchainRoots() {
  const roots = new Set();
  const ext = process.platform === 'win32' ? '.exe' : '';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    if (GNU_DRIVERS.some((d) => fs.existsSync(path.join(dir, d + ext)))) roots.add(path.dirname(dir));
  }
  return [...roots];
}

/**
 * Where a GNU toolchain keeps its archives. MSVC has one layout and the SDK has another,
 * both fixed; a MinGW install has three places that matter and no promise about the name
 * of the root:
 *
 *   <root>/lib                              libstdc++.a and friends
 *   <root>/lib/gcc/<target>/<version>       libgcc.a
 *   <root>/<target>/lib                     libkernel32.a — the Win32 import libraries
 *
 * Asking the driver with `gcc -print-search-dirs` would be exact, but starting a process
 * to find out where files are is the thing this extension exists not to do. The layout is
 * stable across every distribution of it, and listLibs only reads what is directly inside,
 * so a folder guessed wrong costs one failed readdir.
 * @returns {string[]}
 */
function gnuLibDirs() {
  const dirs = new Set();
  for (const root of toolchainRoots()) {
    for (const name of ['lib', 'lib64']) {
      const lib = path.join(root, name);
      dirs.add(lib);
      // lib/x86_64-linux-gnu and the like, where a multiarch system files its archives.
      for (const d of subdirs(lib)) dirs.add(d);
    }
    // <target>/lib for MinGW, and harmlessly <root>/share/lib and the like elsewhere.
    for (const d of subdirs(root)) dirs.add(path.join(d, 'lib'));
    for (const target of subdirs(path.join(root, 'lib', 'gcc'))) {
      for (const version of subdirs(target)) dirs.add(version);
    }
  }
  return [...dirs];
}

/**
 * The archives directly inside these folders, each one only once. Folders are compared by
 * their real path because the same one arrives twice otherwise: a PATH carrying both
 * /usr/bin and /bin finds two toolchain roots that are the same files, and every library
 * under them would be read twice and reported as if found in two places.
 * @param {string[]} dirs @returns {string[]}
 */
function listLibs(dirs) {
  const out = [];
  const seen = new Set();
  for (const d of dirs) {
    let entries;
    let real;
    try {
      real = fs.realpathSync(d);
      if (seen.has(real)) continue;
      seen.add(real);
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
    if (!byName.has(key)) byName.set(key, { name, where: new Set() });
    byName.get(key).where.add(path.win32.basename(path.win32.dirname(f)));
  }
  // A folder name says something only when it differs: MSVC files the same library under
  // x64 and x86, but a MinGW install has three folders all called lib, and "(lib, lib, lib)"
  // is noise where "(x64, x86)" is the answer.
  return [...byName.values()].map((g) => ({ name: g.name, where: [...g.where] }));
}

module.exports = { parseErrors, candidates, scan, decode, libDirs, gnuLibDirs, listLibs, groupLibs };
