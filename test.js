// SPDX-License-Identifier: Apache-2.0
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readImports } = require('./pe');
const { resolveImports } = require('./resolve');
const { readSymbolNames } = require('./ar');
const { manglePrefix } = require('./mangle');
const { parseErrors, decode, libDirs, gnuLibDirs, listLibs, groupLibs } = require('./linkerror');

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

// One line per library, with every architecture it was found under.
assert.deepStrictEqual(
  groupLibs([
    'C:\\Kits\\10\\Lib\\10.0\\um\\x64\\kernel32.Lib',
    'C:\\Kits\\10\\Lib\\10.0\\um\\x86\\kernel32.lib',
    'C:\\Kits\\10\\Lib\\10.0\\um\\x64\\mincore.lib',
    // A MinGW install files the same library under several folders all called lib, and
    // repeating the name says nothing the first one did not.
    'C:\\mingw64\\x86_64-w64-mingw32\\lib\\mincore.lib',
  ]),
  [
    { name: 'kernel32.Lib', where: ['x64', 'x86'] },
    { name: 'mincore.lib', where: ['x64', 'lib'] },
  ]
);
// The same folder name twice says nothing the first one did not: a MinGW install has
// several folders called lib, and "(lib, lib, lib)" is noise where "(x64, x86)" is an answer.
assert.deepStrictEqual(
  groupLibs([
    'C:\\mingw64\\x86_64-w64-mingw32\\lib\\libmincore.a',
    'C:\\mingw64\\lib\\libmincore.a',
  ]),
  [{ name: 'libmincore.a', where: ['lib'] }]
);

// Real output, captured from gcc 13 and lld 18 on a link that failed on purpose. GNU ld
// fences the name between a backtick and a quote; lld runs it to the end of the line. Both
// demangle, which is the whole difficulty: the archive index holds `_ZN2ns4deepEd`.
const GNU = [
  "/usr/bin/ld: /tmp/ccMu5ymE.o: in function `main':",
  "mangle.cpp:(.text+0x22): undefined reference to `other(int)'",
  "/usr/bin/ld: mangle.cpp:(.text+0x48): undefined reference to `ns::deep(double)'",
  "/usr/bin/ld: mangle.cpp:(.text+0x7a): undefined reference to `K::cmethod(int) const'",
  "/usr/bin/ld: mangle.cpp:(.text+0x9e): undefined reference to `c_linkage'",
  "/usr/bin/ld: mangle.cpp:(.text+0xb0): undefined reference to `never_defined(float)'",
  'collect2: error: ld returned 1 exit status',
].join('\n');

const LLD = [
  'ld.lld: error: undefined symbol: ns::deep(double)',
  '>>> referenced by mangle.cpp',
  '>>>               /tmp/mangle-be3e72.o:(main)',
].join('\n');

const gnuErrors = parseErrors(GNU);
// Five names, and neither the "in function" line nor collect2's summary is one of them.
assert.deepStrictEqual(gnuErrors.map((e) => e.gnu), [
  'other(int)', 'ns::deep(double)', 'K::cmethod(int) const', 'c_linkage', 'never_defined(float)',
]);
assert.ok(gnuErrors.every((e) => e.code === 'ld'));

const lldErrors = parseErrors(LLD);
// The ">>>" lines carry the file that referenced it, and must not read as symbols.
assert.deepStrictEqual(lldErrors.map((e) => e.gnu), ['ns::deep(double)']);

// The mangled prefixes, checked against what `nm` actually reports for each of these.
// Anything after the prefix is a parameter list spelled for a reader, which is exactly the
// part that cannot be mangled back — and exactly the part a prefix match does not need.
assert.deepStrictEqual(manglePrefix('other(int)'), { prefix: '_Z5other', comps: ['5other'] });
assert.deepStrictEqual(manglePrefix('ns::deep(double)'), { prefix: '_ZN2ns4deepE', comps: ['2ns', '4deep'] });
assert.deepStrictEqual(manglePrefix('a::b::nested(char)'),
  { prefix: '_ZN1a1b6nestedE', comps: ['1a', '1b', '6nested'] });
// const belongs to the front of a mangled name, not the back: _ZNK, never _ZN.
assert.deepStrictEqual(manglePrefix('K::cmethod(int) const'),
  { prefix: '_ZNK1K7cmethodE', comps: ['1K', '7cmethod'] });
assert.deepStrictEqual(manglePrefix('K::method(int)'), { prefix: '_ZN1K6methodE', comps: ['1K', '6method'] });
// A demangled template function shows a return type, because the mangling encodes one.
assert.deepStrictEqual(manglePrefix('int tmpl<int>(int)'), { prefix: '_Z4tmpl', comps: ['4tmpl'] });
assert.deepStrictEqual(manglePrefix('noargs()'), { prefix: '_Z6noargs', comps: ['6noargs'] });
assert.deepStrictEqual(manglePrefix('refarg(int const&, char*)'), { prefix: '_Z6refarg', comps: ['6refarg'] });
// No parameter list and no qualification: a C name, which archives hold verbatim.
assert.deepStrictEqual(manglePrefix('c_linkage'), { plain: 'c_linkage' });

// std is never spelled out. Checked against this machine's libstdc++.a, where 3,819 of
// 7,357 symbols begin _ZSt or _ZNSt and not one begins _ZN3std.
assert.deepStrictEqual(manglePrefix('std::__throw_length_error(char const*)'),
  { prefix: '_ZSt20__throw_length_error', comps: ['20__throw_length_error'] });
// A variable has no parameter list either, and is still mangled: std::cout is _ZSt4cout.
assert.deepStrictEqual(manglePrefix('std::cout'), { prefix: '_ZSt4cout', comps: ['4cout'] });
// A destructor keeps no name at all — ~bad_alloc() is D0Ev, D1Ev or D2Ev depending on what
// the compiler emitted — so the prefix stops at the class and does not close with E.
assert.deepStrictEqual(manglePrefix('std::bad_alloc::~bad_alloc()'),
  { prefix: '_ZNSt9bad_alloc', comps: ['9bad_alloc'] });
assert.ok('_ZNSt9bad_allocD2Ev'.startsWith(manglePrefix('std::bad_alloc::~bad_alloc()').prefix));
// A template class writes its arguments into the middle of its own name, so the prefix
// breaks and the components in order are what still find it.
const append = manglePrefix('std::__cxx11::basic_string<char, std::char_traits<char>, '
  + 'std::allocator<char> >::append(char const*)');
assert.deepStrictEqual(append.comps, ['7__cxx11', '12basic_string', '6append']);
// An operator's mangled form spells no name, so the honest answer is no answer.
assert.strictEqual(manglePrefix('operator delete(void*)'), null);
assert.strictEqual(manglePrefix('MyType::operator==(MyType const&) const'), null);

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
  // A real archive, built by GNU ar from the four definitions these errors are missing.
  // It rides in the repository because the point of it is to run everywhere — the MSVC
  // half below can only run on a machine with the SDK, and this half must not inherit that.
  const fixture = path.join(__dirname, 'test-gnu.a');
  assert.deepStrictEqual(
    readSymbolNames(fixture).sort(),
    ['_Z5otheri', '_ZN2ns4deepEd', '_ZNK1K7cmethodEi', 'c_linkage'].sort(),
    'the GNU fixture is not the archive these assertions were written against'
  );

  const gnuRows = await decode(GNU, [fixture]);
  // The reported name stays the readable one: nobody greps their code for _ZN2ns4deepEd.
  assert.deepStrictEqual(gnuRows.map((r) => r.symbol), [
    'other(int)', 'ns::deep(double)', 'K::cmethod(int) const', 'c_linkage', 'never_defined(float)',
  ]);
  assert.deepStrictEqual(gnuRows[0].libs, [fixture], 'a free function was not matched');
  assert.deepStrictEqual(gnuRows[1].libs, [fixture], 'a namespaced function was not matched');
  assert.deepStrictEqual(gnuRows[2].libs, [fixture], 'a const member was not matched — _ZNK?');
  assert.deepStrictEqual(gnuRows[3].libs, [fixture], 'a C name was not matched');
  // Nothing defines it, and a prefix match must not invent an answer out of a near miss.
  assert.deepStrictEqual(gnuRows[4].libs, [], 'a symbol nothing defines came back with a library');

  // The second fixture holds the two ways a lookup for ns::deep(double) can go wrong.
  // other::deep shares the `4deep` component and nothing else. ns::inner::deep is the
  // harder one: its components contain `2ns` and then `4deep` in order, so the loose test
  // accepts it and only the prefix rejects it. Without that symbol the prefix match could
  // be deleted outright and every assertion here would still pass.
  const decoy = path.join(__dirname, 'test-gnu-decoy.a');
  assert.deepStrictEqual(readSymbolNames(decoy), ['_ZN5other4deepEd', '_ZN2ns5inner4deepEd']);
  const bothRows = await decode(GNU, [fixture, decoy]);
  assert.deepStrictEqual(bothRows[1].symbol, 'ns::deep(double)');
  assert.deepStrictEqual(bothRows[1].libs, [fixture],
    'a function of the same name in another namespace was dragged in — is the prefix match still there?');

  const lldRows = await decode(LLD, [fixture]);
  assert.deepStrictEqual(lldRows.map((r) => r.symbol), ['ns::deep(double)']);
  assert.deepStrictEqual(lldRows[0].libs, [fixture]);

  // An operator reports as unanswerable rather than as absent: "in no library here" would
  // send someone to look at their own build over a question that was never asked.
  const opRows = await decode(
    "/usr/bin/ld: main.cpp:(.text+0x1): undefined reference to `operator delete(void*)'", [fixture]);
  assert.strictEqual(opRows.length, 1);
  assert.strictEqual(opRows[0].unknown, true);
  assert.deepStrictEqual(opRows[0].libs, []);
  // An ordinary missing symbol is absent, not unanswerable, and must not claim otherwise.
  assert.strictEqual(gnuRows[4].unknown, undefined);

  // Where the toolchain sits differs on every machine, so what is under test is that
  // looking for it reads folders rather than throwing on the ones that are not there.
  assert.ok(Array.isArray(gnuLibDirs()));

  const kernel32 = listLibs(libDirs()).find((f) => /[\\/]um[\\/]x64[\\/]kernel32\.lib$/i.test(f));
  if (!kernel32) {
    console.log('ok (MSVC·SDK 가 없어 그쪽 아카이브 검사만 건너뜀)');
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
