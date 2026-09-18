// SPDX-License-Identifier: Apache-2.0
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readImports } = require('./pe');
const { resolveImports } = require('./resolve');

// Windows ships these, so the test has a real 64-bit and a real 32-bit binary to read.
const root = process.env.SystemRoot || 'C:\\Windows';
const exe64 = path.join(root, 'System32', 'notepad.exe');
const exe32 = path.join(root, 'SysWOW64', 'notepad.exe');

if (fs.existsSync(exe64)) {
  const pe = readImports(exe64);
  assert.strictEqual(pe.arch, 'x64');
  assert.ok(pe.imports.length, 'notepad imports nothing?');
  // Modern Windows binaries reach the kernel through API sets, so USER32 is the honest landmark.
  assert.ok(pe.imports.some((d) => /^user32\.dll$/i.test(d)), `no user32: ${pe.imports}`);
  assert.ok(pe.imports.some((d) => /^api-ms-win-/i.test(d)), 'no API set imports');
  assert.ok(pe.imports.every((d) => /\.dll$/i.test(d)), `not all names look like DLLs: ${pe.imports}`);

  const rows = resolveImports(exe64, pe);
  const unresolved = rows.filter((r) => !r.found && !r.apiSet);
  assert.strictEqual(unresolved.length, 0, `Windows' own binary has missing DLLs: ${unresolved.map((r) => r.name)}`);
  assert.ok(rows.some((r) => r.found && r.found.toLowerCase().includes('system32')));
}

if (fs.existsSync(exe32)) {
  const pe = readImports(exe32);
  assert.strictEqual(pe.arch, 'x86');
  // A 32-bit binary must resolve into SysWOW64, not System32.
  const user32 = resolveImports(exe32, pe).find((r) => /^user32\.dll$/i.test(r.name));
  assert.ok(user32?.found?.toLowerCase().includes('syswow64'), `32-bit user32 resolved to ${user32?.found}`);
}

// A file that is not a PE at all must say so rather than read rubbish.
assert.throws(() => readImports(__filename), /not a PE file/);

// Every translated string must exist in every translation, or a Korean window falls back to English.
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const pkg = fs.readFileSync('package.json', 'utf8');
const nls = read('package.nls.json');
const nlsKo = read('package.nls.ko.json');
for (const [, key] of pkg.matchAll(/"%([^%]+)%"/g)) {
  assert.ok(key in nls, `package.nls.json 에 ${key} 없음`);
  assert.ok(key in nlsKo, `package.nls.ko.json 에 ${key} 없음`);
}
assert.deepStrictEqual(Object.keys(nls).sort(), Object.keys(nlsKo).sort());

const ko = read('l10n/bundle.l10n.ko.json');
const code = fs.readFileSync('extension.js', 'utf8');
const used = [...code.matchAll(/l10n\.t\('([^']*)'/g)].map((m) => m[1]);
assert.ok(used.length, 'extension.js 에서 l10n.t 를 찾지 못함');
for (const t of used) assert.ok(t in ko, `bundle.l10n.ko.json 에 ${t} 없음`);
assert.deepStrictEqual(Object.keys(ko).sort(), [...new Set(used)].sort());

console.log('ok');
