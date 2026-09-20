// SPDX-License-Identifier: Apache-2.0
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readImports } = require('./pe');
const { resolveImports } = require('./resolve');
const { readSymbolNames } = require('./ar');
const { parseErrors, isDemangled, decode, libDirs, listLibs, groupLibs } = require('./linkerror');

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
// An archive is not a PE, and this file is neither.
assert.throws(() => readSymbolNames(__filename), /not an archive/);

// Real MSVC output, captured from a link that failed on purpose. Korean, because that is
// where the parsing is hard: the linker's " referenced in function " is an empty string
// there, so the symbol and the function that referenced it end up spelled as one word.
const KOREAN = [
  'lnk2.obj : error LNK2019: "void __cdecl declared_but_never_defined(int)" (?declared_but_never_defined@@YAXH@Z)main 함수에서 참조되는 확인할 수 없는 외부 기호',
  'lnk2.obj : error LNK2019: plain_c_functionmain 함수에서 참조되는 확인할 수 없는 외부 기호',
  'lnk2.obj : error LNK2019: CreateFileWmain 함수에서 참조되는 확인할 수 없는 외부 기호',
  'libucrt.lib(per_thread_data.obj) : error LNK2001: 확인할 수 없는 외부 기호 __imp_GetCurrentThreadId',
  'lnk2.exe : fatal error LNK1120: 3개의 확인할 수 없는 외부 참조입니다.',
].join('\r\n');

// This machine has only the Korean language pack, so the English wording below is taken
// from the documented message rather than captured. The parse must hold for both.
const ENGLISH = [
  'main.obj : error LNK2019: unresolved external symbol plain_c_function referenced in function main',
  'main.obj : error LNK2019: unresolved external symbol CreateFileW referenced in function main',
  'main.exe : fatal error LNK1120: 2 unresolved externals',
].join('\n');

const koErrors = parseErrors(KOREAN);
// Four errors, and the LNK1120 summary line is not one of them.
assert.deepStrictEqual(koErrors.map((e) => e.code), ['LNK2019', 'LNK2019', 'LNK2019', 'LNK2001']);
assert.deepStrictEqual(koErrors[0].decorated, ['?declared_but_never_defined@@YAXH@Z']);
// The decorated name says everything; "main" beside it is the caller, not a symbol to hunt.
assert.deepStrictEqual(koErrors[0].tokens, ['main']);
assert.deepStrictEqual(koErrors[1].tokens, ['plain_c_functionmain']);
assert.deepStrictEqual(koErrors[3].tokens, ['__imp_GetCurrentThreadId']);

const enErrors = parseErrors(ENGLISH);
assert.deepStrictEqual(enErrors.map((e) => e.code), ['LNK2019', 'LNK2019']);
// The linker's own English words must not outrank the symbol they wrap.
assert.strictEqual(enErrors[0].tokens[0], 'plain_c_function');
assert.strictEqual(enErrors[1].tokens[0], 'CreateFileW');

// Real MinGW output, captured by linking programs whose symbols were left undefined on
// purpose: x86_64-w64-mingw32-gcc 13 driving GNU ld 2.41.90, the same binutils MinGW ships.
// The English MSVC lines above had to be copied from the docs; none of these did.
const LD = [
  "/usr/bin/x86_64-w64-mingw32-ld: main.o:main.c:(.text+0x16): undefined reference to `plain_c_function'",
  "/usr/bin/x86_64-w64-mingw32-ld: sock.o:sock.c:(.text+0x1f): undefined reference to `__imp_WSAStartup'",
  'collect2: error: ld returned 1 exit status',
].join('\n');

// The same link built with -g. ld then puts the object and the enclosing function on a line
// of their own, and the error line below it starts with the source file and line number.
const LD_DEBUG = [
  "/usr/bin/x86_64-w64-mingw32-ld: main_g.o: in function `main':",
  "/home/build/app/main.c:3:(.text+0x16): undefined reference to `plain_c_function'",
  "/usr/bin/x86_64-w64-mingw32-ld: sock_g.o: in function `sock_init':",
  "/home/build/app/sock.c:2:(.text+0x1f): undefined reference to `__imp_WSAStartup'",
  'collect2: error: ld returned 1 exit status',
].join('\n');

// One symbol called three times. ld reports every reference, where MSVC reports the symbol.
const LD_REPEAT = [
  "/usr/bin/x86_64-w64-mingw32-ld: repeat.o:repeat.c:(.text+0x16): undefined reference to `repeated_symbol'",
  "/usr/bin/x86_64-w64-mingw32-ld: repeat.o:repeat.c:(.text+0x22): undefined reference to `repeated_symbol'",
  "/usr/bin/x86_64-w64-mingw32-ld: repeat.o:repeat.c:(.text+0x2e): undefined reference to `repeated_symbol'",
  'collect2: error: ld returned 1 exit status',
].join('\n');

// C++ through g++, and the same link again with -Wl,--no-demangle. The second is what an
// archive index holds; the first is the same link error with the names made readable.
const LD_CPP = [
  "/usr/bin/x86_64-w64-mingw32-ld: missing.o:missing.cpp:(.text+0x13): undefined reference to `declared_but_never_defined(int)'",
  "/usr/bin/x86_64-w64-mingw32-ld: missing.o:missing.cpp:(.text+0x18): undefined reference to `missing_too()'",
  'collect2: error: ld returned 1 exit status',
].join('\n');
const LD_CPP_RAW = [
  "/usr/bin/x86_64-w64-mingw32-ld: missing.o:missing.cpp:(.text+0x13): undefined reference to `_Z26declared_but_never_definedi'",
  "/usr/bin/x86_64-w64-mingw32-ld: missing.o:missing.cpp:(.text+0x18): undefined reference to `_Z11missing_toov'",
  'collect2: error: ld returned 1 exit status',
].join('\n');

// ld run directly on an object calling GetCurrentThreadId with no kernel32 on the command
// line. MSVC's kernel32.lib defines the same import symbol, so this one can be looked up.
const LD_WIN =
  "x86_64-w64-mingw32-ld: win.o:win.c:(.text+0xb): undefined reference to `__imp_GetCurrentThreadId'";

const ldErrors = parseErrors(LD);
// collect2's line names no symbol, so it is not an error of its own — the LNK1120 summary
// line above is the MSVC counterpart of the same rule.
assert.deepStrictEqual(ldErrors.map((e) => e.code), ['ld', 'ld']);
assert.deepStrictEqual(ldErrors.map((e) => e.decorated[0]), ['plain_c_function', '__imp_WSAStartup']);
// The quotes settle where the name ends, so there is nothing left for the prefix walk.
assert.deepStrictEqual(ldErrors[0].tokens, []);

// The "in function" line above each error carries no symbol and must add no error.
assert.deepStrictEqual(
  parseErrors(LD_DEBUG).map((e) => e.decorated[0]), ['plain_c_function', '__imp_WSAStartup']);

// Three references, one symbol, one answer.
const ldRepeat = parseErrors(LD_REPEAT);
assert.strictEqual(ldRepeat.length, 1, 'ld repeats a symbol once per reference; fold them');
assert.strictEqual(ldRepeat[0].decorated[0], 'repeated_symbol');

const ldCpp = parseErrors(LD_CPP);
assert.deepStrictEqual(ldCpp.map((e) => e.decorated[0]), ['declared_but_never_defined(int)', 'missing_too()']);
assert.ok(ldCpp.every((e) => isDemangled(e.decorated[0])), 'a demangled name must be marked as one');
const ldCppRaw = parseErrors(LD_CPP_RAW);
assert.deepStrictEqual(ldCppRaw.map((e) => e.decorated[0]), ['_Z26declared_but_never_definedi', '_Z11missing_toov']);
assert.ok(ldCppRaw.every((e) => !isDemangled(e.decorated[0])), 'a mangled name is what the index holds');
// An MSVC decorated name is not demangler output, or every LNK2019 would be marked unfindable.
assert.ok(!isDemangled('?declared_but_never_defined@@YAXH@Z'));

// Both linkers in one paste: neither branch may swallow the other's lines.
assert.deepStrictEqual(
  parseErrors(`${KOREAN}\r\n${LD}`).map((e) => e.code),
  ['LNK2019', 'LNK2019', 'LNK2019', 'LNK2001', 'ld', 'ld']
);

// One line per library, with every architecture it was found under.
assert.deepStrictEqual(
  groupLibs([
    'C:\\Kits\\10\\Lib\\10.0\\um\\x64\\kernel32.Lib',
    'C:\\Kits\\10\\Lib\\10.0\\um\\x86\\kernel32.lib',
    'C:\\Kits\\10\\Lib\\10.0\\um\\x64\\mincore.lib',
  ]),
  [
    { name: 'kernel32.Lib', where: ['x64', 'x86'] },
    { name: 'mincore.lib', where: ['x64'] },
  ]
);

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

const koBundle = read('l10n/bundle.l10n.ko.json');
const code = fs.readFileSync('extension.js', 'utf8');
const used = [...code.matchAll(/l10n\.t\('([^']*)'/g)].map((m) => m[1]);
assert.ok(used.length, 'extension.js 에서 l10n.t 를 찾지 못함');
for (const t of used) assert.ok(t in koBundle, `bundle.l10n.ko.json 에 ${t} 없음`);
assert.deepStrictEqual(Object.keys(koBundle).sort(), [...new Set(used)].sort());

// The lookup needs a real archive, so it only runs where MSVC and the SDK are installed.
async function main() {
  // The ld path reaches the lookup with nothing installed: search no archives at all and
  // every symbol comes back exactly as ld quoted it, found nowhere.
  const ldRows = await decode(LD, []);
  assert.deepStrictEqual(ldRows.map((r) => r.symbol), ['plain_c_function', '__imp_WSAStartup']);
  assert.ok(ldRows.every((r) => r.libs.length === 0));
  assert.deepStrictEqual((await decode(LD_CPP, [])).map((r) => r.symbol),
    ['declared_but_never_defined(int)', 'missing_too()']);

  const kernel32 = listLibs(libDirs()).find((f) => /[\\/]um[\\/]x64[\\/]kernel32\.lib$/i.test(f));
  if (!kernel32) {
    console.log('ok (MSVC·SDK 가 없어 아카이브 검사는 건너뜀)');
    return;
  }

  const names = readSymbolNames(kernel32);
  assert.ok(names.length > 1000, `kernel32 has only ${names.length} symbols?`);
  assert.ok(names.includes('CreateFileW'), 'kernel32 does not define CreateFileW');
  assert.ok(names.includes('__imp_CreateFileW'), 'kernel32 does not define __imp_CreateFileW');

  // Searching one library is enough to prove the lookup; what is under test is the seam,
  // not the size of the scan.
  const rows = await decode(KOREAN, [kernel32]);
  assert.strictEqual(rows.length, 4);
  // A decorated name is exact, and nothing in kernel32 defines it.
  assert.strictEqual(rows[0].symbol, '?declared_but_never_defined@@YAXH@Z');
  assert.deepStrictEqual(rows[0].libs, []);
  // A C symbol fused to its caller: the archive decides where the name ends.
  assert.strictEqual(rows[1].symbol, 'plain_c_functionmain');
  assert.deepStrictEqual(rows[1].libs, [], 'a symbol nothing defines must come back empty');
  assert.strictEqual(rows[2].symbol, 'CreateFileW', 'the CreateFileWmain seam was not found');
  assert.deepStrictEqual(rows[2].libs, [kernel32]);
  assert.strictEqual(rows[3].symbol, '__imp_GetCurrentThreadId');
  assert.deepStrictEqual(rows[3].libs, [kernel32]);

  // A MinGW import symbol looked up in an MSVC library: the same name, from both sides.
  const ldWinRows = await decode(LD_WIN, [kernel32]);
  assert.strictEqual(ldWinRows[0].symbol, '__imp_GetCurrentThreadId');
  assert.deepStrictEqual(ldWinRows[0].libs, [kernel32]);

  const enRows = await decode(ENGLISH, [kernel32]);
  assert.strictEqual(enRows[0].symbol, 'plain_c_function');
  assert.deepStrictEqual(enRows[0].libs, []);
  assert.strictEqual(enRows[1].symbol, 'CreateFileW');
  assert.deepStrictEqual(enRows[1].libs, [kernel32]);

  console.log('ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
