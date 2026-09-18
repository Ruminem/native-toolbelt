// SPDX-License-Identifier: Apache-2.0
'use strict';
const vscode = require('vscode');
const path = require('path');
const { readImports } = require('./pe');
const { resolveImports } = require('./resolve');

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
      if (!file) return;

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
      } catch (err) {
        vscode.window.showErrorMessage(vscode.l10n.t('Could not read {0}: {1}', path.basename(file), err.message));
      }
    })
  );
}

module.exports = { activate };
