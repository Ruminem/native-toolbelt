// SPDX-License-Identifier: Apache-2.0
'use strict';
const vscode = require('vscode');
const path = require('path');
const { readImports } = require('./pe');
const { resolveImports } = require('./resolve');
const { parseErrors, decode, libDirs, gnuLibDirs, listLibs, groupLibs } = require('./linkerror');

/** @param {vscode.OutputChannel} channel @param {string} file */
function report(channel, file) {
  const pe = readImports(file);
  const rows = resolveImports(file, pe);
  const missing = rows.filter((r) => !r.found && !r.apiSet);

  channel.clear();
  channel.appendLine(`${file}  (${pe.arch})`);
  channel.appendLine('');
  for (const r of rows) {
    const mark = r.found ? '  ok' : r.apiSet ? ' api' : ' !! ';
    const kind = r.delay ? ' [delay]' : '';
    const where = r.found || (r.apiSet ? vscode.l10n.t('API set, supplied by Windows') : r.nearby
      ? vscode.l10n.t('not on the search path, but here: {0}', r.nearby)
      : vscode.l10n.t('not found'));
    channel.appendLine(`${mark} ${r.name}${kind}  —  ${where}`);
  }
  channel.appendLine('');
  channel.appendLine(vscode.l10n.t('{0} imported, {1} missing', String(rows.length), String(missing.length)));
  channel.show(true);
  return missing;
}

/**
 * Take a linker error and say which library defines the symbol it could not resolve.
 * Returns the rows it reported, so a test running inside the extension host can check them.
 * @param {vscode.OutputChannel} channel
 */
async function decodeLinkError(channel) {
  const editor = vscode.window.activeTextEditor;
  const selected = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
  // Link errors land in the terminal or the problems panel, neither of which is a document
  // to select text in, so the clipboard is the entrance that both of them can reach.
  const text = selected.trim() || (await vscode.env.clipboard.readText());
  if (!parseErrors(text).length) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('No link error in the selection or the clipboard.'));
    return [];
  }

  const workspaceLibs = await vscode.workspace.findFiles('**/*.{lib,a}', '**/node_modules/**');
  // Both toolchains are searched whichever error was pasted. Which compiler produced the
  // message does not narrow where the symbol lives: a MinGW build links MSVC-built .lib
  // files and a MSVC one links a .a from a vcpkg port, and an archive that cannot answer
  // costs one read of its index.
  const files = [...workspaceLibs.map((u) => u.fsPath), ...listLibs([...libDirs(), ...gnuLibDirs()])];

  const rows = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Native Toolbelt' },
    (progress) => decode(text, files, (done, total) =>
      progress.report({ message: vscode.l10n.t('{0} of {1} libraries', String(done), String(total)) }))
  );

  channel.clear();
  for (const r of rows) {
    channel.appendLine(`${r.code}  ${r.symbol}`);
    const groups = groupLibs(r.libs);
    // Absent and unanswerable are different answers, and only one of them tells you to go
    // look at your own build.
    if (r.unknown) {
      channel.appendLine(`      ${vscode.l10n.t('an operator — a mangled name spells none, so this cannot be looked up')}`);
    } else if (!groups.length) {
      channel.appendLine(`      ${vscode.l10n.t('in no library here — so it is missing from your own build')}`);
    }
    for (const g of groups) channel.appendLine(`      ${g.name}  (${g.where.join(', ')})`);
    channel.appendLine('');
  }
  channel.appendLine(vscode.l10n.t('searched {0} libraries', String(files.length)));
  channel.show(true);

  const found = rows.filter((r) => r.libs.length);
  // A symbol this could not look up belongs in neither count, or the summary would claim a
  // conclusion about it.
  const answered = rows.filter((r) => !r.unknown);
  if (found.length) {
    vscode.window.showInformationMessage(
      vscode.l10n.t('{0} of {1} symbols are in a library — link it.', String(found.length), String(answered.length)));
  } else if (!answered.length) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('None of these names can be looked up: an operator is mangled without one.'));
  } else {
    vscode.window.showWarningMessage(
      vscode.l10n.t('None of the {0} symbols is in a library here, so each one is missing from your own build.',
        String(answered.length)));
  }
  return rows;
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const channel = vscode.window.createOutputChannel('Native Toolbelt');
  context.subscriptions.push(
    channel,
    vscode.commands.registerCommand('nativeToolbelt.checkDlls', async (uri) => {
      let file = uri?.fsPath;
      if (!file) {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          filters: { [vscode.l10n.t('Binaries')]: ['exe', 'dll'] },
          openLabel: vscode.l10n.t('Check'),
        });
        file = picked?.[0]?.fsPath;
      }
      if (!file) return [];

      try {
        const missing = report(channel, file);
        const name = path.basename(file);
        if (missing.length) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('{0}: {1} DLLs are missing — {2}', name, String(missing.length),
              missing.map((m) => m.name).join(', '))
          );
        } else {
          vscode.window.showInformationMessage(vscode.l10n.t('{0}: every imported DLL was found.', name));
        }
        return missing;
      } catch (err) {
        vscode.window.showErrorMessage(vscode.l10n.t('Could not read {0}: {1}', path.basename(file), err.message));
        throw err;
      }
    }),
    vscode.commands.registerCommand('nativeToolbelt.decodeLinkError', async () => {
      try {
        return await decodeLinkError(channel);
      } catch (err) {
        vscode.window.showErrorMessage(vscode.l10n.t('Could not search the libraries: {0}', err.message));
        throw err;
      }
    })
  );
}

module.exports = { activate };
