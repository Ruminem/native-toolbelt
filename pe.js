// SPDX-License-Identifier: Apache-2.0
'use strict';
/**
 * The names of the DLLs a PE file imports, read from the file itself.
 *
 * dumpbin answers the same question, but only where Visual Studio is installed and only
 * after finding it. The PE layout is a published format and the part we need is small.
 */
const fs = require('fs');

const MACHINE = { 0x014c: 'x86', 0x8664: 'x64', 0xaa64: 'arm64' };

/** @param {{va: number, size: number, raw: number}[]} sections */
function rvaToOffset(sections, rva) {
  for (const s of sections) {
    if (rva >= s.va && rva < s.va + s.size) return rva - s.va + s.raw;
  }
  return -1;
}

/** @param {Buffer} buf @param {number} offset */
function cstring(buf, offset) {
  if (offset < 0 || offset >= buf.length) return '';
  const end = buf.indexOf(0, offset);
  return buf.toString('latin1', offset, end < 0 ? buf.length : end);
}

/**
 * @param {string} file
 * @returns {{arch: string, imports: string[], delayImports: string[]}}
 */
function readImports(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not a PE file (no MZ header)');
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x00004550) throw new Error('not a PE file (no PE signature)');

  const machine = buf.readUInt16LE(pe + 4);
  const sectionCount = buf.readUInt16LE(pe + 6);
  const optionalSize = buf.readUInt16LE(pe + 20);
  const optional = pe + 24;
  // PE32+ carries four extra 8-byte fields before the directories, hence the different offset.
  const magic = buf.readUInt16LE(optional);
  const directories = optional + (magic === 0x20b ? 112 : 96);

  const sectionStart = optional + optionalSize;
  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const s = sectionStart + i * 40;
    const virtualSize = buf.readUInt32LE(s + 8);
    const rawSize = buf.readUInt32LE(s + 16);
    sections.push({
      va: buf.readUInt32LE(s + 12),
      // A section can be larger in memory than on disk; take whichever covers more.
      size: Math.max(virtualSize, rawSize),
      raw: buf.readUInt32LE(s + 20),
    });
  }

  /** Walk a table of fixed-size entries, reading a name RVA out of each, until the terminator. */
  const names = (dirIndex, entrySize, nameField) => {
    const rva = buf.readUInt32LE(directories + dirIndex * 8);
    if (!rva) return [];
    let at = rvaToOffset(sections, rva);
    const out = [];
    while (at >= 0 && at + entrySize <= buf.length) {
      const nameRva = buf.readUInt32LE(at + nameField);
      if (!nameRva) break;
      const name = cstring(buf, rvaToOffset(sections, nameRva));
      if (!name) break;
      out.push(name);
      at += entrySize;
    }
    return out;
  };

  return {
    arch: MACHINE[machine] || `0x${machine.toString(16)}`,
    imports: names(1, 20, 12),
    // Delay-loaded DLLs are missing just as loudly, only later, at the first call into them.
    delayImports: names(13, 32, 4),
  };
}

module.exports = { readImports };
