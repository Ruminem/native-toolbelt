// SPDX-License-Identifier: Apache-2.0
'use strict';
/**
 * Where Windows would find each imported DLL, and which ones it would not find at all.
 *
 * This follows the ordinary search order, minus the parts no one can see from outside:
 * the loader also consults SxS manifests, the DLL redirection file and AddDllDirectory
 * calls made at runtime. A DLL reported as found here is found; a DLL reported as missing
 * may still be supplied by one of those.
 */
const fs = require('fs');
const path = require('path');

// api-ms-win-* and ext-ms-* are API sets: names the loader maps to a real DLL, with no file to find.
const API_SET = /^(api-ms-win-|ext-ms-)/i;

/**
 * @param {string} exe @param {string} arch from readImports
 * @returns {string[]} directories, in search order
 */
function searchPath(exe, arch) {
  const root = process.env.SystemRoot || 'C:\\Windows';
  const dirs = [path.dirname(path.resolve(exe))];
  // A 32-bit process gets SysWOW64 wherever it asks for System32, so look where it will really land.
  dirs.push(arch === 'x86' ? path.join(root, 'SysWOW64') : path.join(root, 'System32'));
  dirs.push(root);
  dirs.push(...(process.env.PATH || '').split(path.delimiter).filter(Boolean));
  return dirs;
}

/**
 * A DLL that exists near the exe but off the search path is a different problem from one
 * that is absent: it is usually a copy step that did not run, or a loader path added at
 * runtime. Worth naming, so "missing" does not send anyone hunting for a file they have.
 * @param {string} dir @param {string} name @param {number} depth
 * @returns {string|null}
 */
function findNearby(dir, name, depth = 3) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return path.join(dir, e.name);
  }
  if (depth <= 0) return null;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const hit = findNearby(path.join(dir, e.name), name, depth - 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {string} exe @param {{arch: string, imports: string[], delayImports: string[]}} pe
 * @returns {{name: string, delay: boolean, found: string|null, apiSet: boolean, nearby?: string|null}[]}
 */
function resolveImports(exe, pe) {
  const dirs = searchPath(exe, pe.arch);
  const all = [
    ...pe.imports.map((name) => ({ name, delay: false })),
    ...pe.delayImports.map((name) => ({ name, delay: true })),
  ];
  return all.map(({ name, delay }) => {
    if (API_SET.test(name)) return { name, delay, found: null, apiSet: true };
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return { name, delay, found: candidate, apiSet: false };
    }
    return { name, delay, found: null, apiSet: false, nearby: findNearby(dirs[0], name) };
  });
}

module.exports = { resolveImports, searchPath, findNearby };
