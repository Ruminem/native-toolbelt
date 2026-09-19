// SPDX-License-Identifier: Apache-2.0
/**
 * The part of the extension that test.js cannot reach: the commands as VS Code actually
 * runs them — activation, the clipboard, workspace file search, the progress window.
 *
 * Run it against an installed VS Code, with no test framework and nothing to install:
 *
 *   code --extensionDevelopmentPath=<repo> --extensionTestsPath=<repo>\uitest.js \
 *        --user-data-dir=<a scratch dir> --disable-extensions <repo>
 *
 * VS Code opens a window, calls run(), and exits non-zero if it rejects.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

// The same captured Korean output test.js uses, so both layers are checked against the
// thing the linker really printed.
const KOREAN = [
  'lnk2.obj : error LNK2019: "void __cdecl declared_but_never_defined(int)" (?declared_but_never_defined@@YAXH@Z)main 함수에서 참조되는 확인할 수 없는 외부 기호',
  'lnk2.obj : error LNK2019: plain_c_functionmain 함수에서 참조되는 확인할 수 없는 외부 기호',
  'lnk2.obj : error LNK2019: CreateFileWmain 함수에서 참조되는 확인할 수 없는 외부 기호',
  'libucrt.lib(per_thread_data.obj) : error LNK2001: 확인할 수 없는 외부 기호 __imp_GetCurrentThreadId',
  'lnk2.exe : fatal error LNK1120: 3개의 확인할 수 없는 외부 참조입니다.',
].join('\r\n');

/**
 * Code.exe is a GUI process on Windows, so whatever it prints may never reach the shell
 * that started it. The result goes to NT_UITEST_OUT as well, and the exit code stands
 * either way.
 */
async function run() {
  const out = process.env.NT_UITEST_OUT;
  try {
    const line = await check();
    if (out) fs.writeFileSync(out, `${line}\n`, 'utf8');
    console.log(line);
  } catch (err) {
    if (out) fs.writeFileSync(out, `FAIL ${err.message}\n\n${err.stack}\n`, 'utf8');
    throw err;
  }
}

async function check() {
  const ext = vscode.extensions.getExtension('Ruminem.native-toolbelt');
  assert.ok(ext, 'Ruminem.native-toolbelt 를 확장 호스트가 못 찾음');
  await ext.activate();
  assert.ok(ext.isActive, '확장이 활성화되지 않음');

  const commands = await vscode.commands.getCommands(true);
  for (const id of ['nativeToolbelt.checkDlls', 'nativeToolbelt.decodeLinkError']) {
    assert.ok(commands.includes(id), `${id} 가 등록되지 않음`);
  }

  // The command reads the clipboard, which belongs to whoever is at the keyboard.
  const saved = await vscode.env.clipboard.readText();
  let rows;
  try {
    await vscode.env.clipboard.writeText(KOREAN);
    rows = await vscode.commands.executeCommand('nativeToolbelt.decodeLinkError');
  } finally {
    await vscode.env.clipboard.writeText(saved);
  }

  assert.ok(Array.isArray(rows), `명령이 배열을 돌려주지 않음: ${typeof rows}`);
  assert.strictEqual(rows.length, 4, `LNK 줄 4개를 기대했는데 ${rows.length}개`);
  assert.strictEqual(rows[0].symbol, '?declared_but_never_defined@@YAXH@Z');
  assert.deepStrictEqual(rows[0].libs, [], '정의된 적 없는 심볼이 라이브러리에서 나옴');
  assert.strictEqual(rows[2].symbol, 'CreateFileW', 'CreateFileWmain 의 경계를 못 가름');
  assert.ok(rows[2].libs.some((f) => /kernel32\.lib$/i.test(f)), `kernel32 가 없음: ${rows[2].libs}`);
  assert.strictEqual(rows[3].symbol, '__imp_GetCurrentThreadId');
  assert.ok(rows[3].libs.length, '__imp_GetCurrentThreadId 를 어디서도 못 찾음');

  // The other command still works, since this version touched the file it lives in.
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'notepad.exe');
  if (fs.existsSync(exe)) {
    const missing = await vscode.commands.executeCommand('nativeToolbelt.checkDlls', vscode.Uri.file(exe));
    assert.ok(Array.isArray(missing), 'checkDlls 가 배열을 돌려주지 않음');
    assert.strictEqual(missing.length, 0, `notepad 에서 못 찾은 DLL: ${missing.map((m) => m.name)}`);
  }

  return `ok (확장 호스트 안) — LNK 줄 ${rows.length}개, CreateFileW 를 ${rows[2].libs.length}개 라이브러리에서 찾음`;
}

module.exports = { run };
