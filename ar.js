// SPDX-License-Identifier: Apache-2.0
'use strict';
/**
 * The symbol index of a static library (.lib, .a).
 *
 * An archive is a short magic, then members laid end to end. The first member, named "/",
 * is the linker's own index: it exists so a linker can answer "who defines this symbol?"
 * without opening the object files behind it. A link error asks exactly that question, so
 * this reads the index and stops — measured across a Windows SDK and MSVC install, that is
 * 22 MB instead of 598 MB, and under a second instead of minutes of dumpbin processes.
 *
 * MSVC archives carry a second "/" member holding the same table little-endian, and GNU ar
 * carries only the first; reading the first covers both toolchains.
 */
const fs = require('fs');

const MAGIC = '!<arch>\n';
// name[16] date[12] uid[6] gid[6] mode[8] size[10] "`\n" — fixed width, ASCII, space padded.
const MEMBER_HEADER = 60;
const SIZE_AT = 48;

/**
 * @param {string} file a .lib or .a
 * @returns {string[]} every symbol name the archive claims to define, in index order
 */
function readSymbolNames(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(MAGIC.length + MEMBER_HEADER);
    if (fs.readSync(fd, head, 0, head.length, 0) < head.length) throw new Error('not an archive');
    if (head.subarray(0, MAGIC.length).toString('latin1') !== MAGIC) throw new Error('not an archive');

    const member = head.subarray(MAGIC.length);
    // Anything but "/" first means the archive was built without a symbol index; there is
    // nothing to answer with, and that is not an error worth stopping a 500-file scan for.
    if (member.subarray(0, 16).toString('latin1').trim() !== '/') return [];
    const size = parseInt(member.subarray(SIZE_AT, SIZE_AT + 10).toString('latin1').trim(), 10);
    if (!(size > 4)) return [];

    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, head.length);
    const count = buf.readUInt32BE(0); // big-endian even on x86: the format predates the PC
    const names = [];
    let p = 4 + count * 4; // skip the member offsets — only the names answer the question
    for (let i = 0; i < count && p < size; i++) {
      const end = buf.indexOf(0, p);
      if (end < 0) break;
      names.push(buf.subarray(p, end).toString('latin1'));
      p = end + 1;
    }
    return names;
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { readSymbolNames };
