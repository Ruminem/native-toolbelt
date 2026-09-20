// SPDX-License-Identifier: Apache-2.0
'use strict';
/**
 * Turning the name GNU ld prints back into something an archive index can be asked about.
 *
 * MSVC prints the decorated name beside the readable one, so looking a symbol up is a
 * straight comparison. GNU ld does the opposite favour: it demangles for you. The archive
 * index still holds `_ZN2ns4deepEd`, the error still says `ns::deep(double)`, and the two
 * never meet.
 *
 * Mangling back is not possible — the parameter types in the message are spelled for a
 * reader, not for the mangler, and a return type that never appears cannot be invented.
 * But Itanium mangling puts the qualified name first, each part written as its length
 * followed by its letters, so the *beginning* of the mangled name can be rebuilt exactly:
 *
 *     ns::deep(double)        ->  _ZN2ns4deepE   is a prefix of  _ZN2ns4deepEd
 *     K::cmethod(int) const   ->  _ZNK1K7cmethodE
 *     plain(int)              ->  _Z5plain       is a prefix of  _Z5plaini
 *
 * Everything the message spells for a reader falls after that point, so a prefix match
 * finds the symbol and its overloads without decoding a single parameter. Nothing is run,
 * nothing is parsed twice, and c++filt never has to exist on the machine.
 */

// A name shorter than this, asked as a prefix, starts matching unrelated symbols.
const MIN_NAME = 2;

// `std` is never spelled out in a mangled name. Of the 7,357 symbols in this machine's
// libstdc++.a, 3,819 begin `_ZSt` or `_ZNSt` and not one begins `_ZN3std`, so building the
// obvious prefix for a std:: name would be building one that cannot match anything.
const STD = 'std';

/**
 * The qualifiers a demangler writes after the parameter list. They belong to the mangled
 * name too, but at its front: a const member function is `_ZNK...`, not `_ZN...`.
 */
const TRAILING = /\s*(?:const|volatile)?\s*(?:const|volatile)?\s*(?:&&|&)?\s*(?:noexcept)?\s*$/;

/**
 * Walks the text tracking `<>` and `()` depth and reports the first `(` seen at depth zero.
 * `tmpl<int>(int)` has its template arguments before the parameter list, so taking the
 * first `(` in the string would be right here and wrong for `tmpl<f(int)>(int)`.
 * @param {string} s @returns {number} index of the parameter list, or -1
 */
function paramListAt(s) {
  let angle = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<') angle++;
    else if (c === '>') angle--;
    else if (c === '(' && angle === 0) return i;
  }
  return -1;
}

/** Drops `<...>` groups, so `vector<int>::at` is asked about as `vector::at`. */
function stripTemplates(s) {
  let out = '';
  let depth = 0;
  for (const c of s) {
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

/**
 * Splits a qualified name on `::` without splitting inside `<...>`, which
 * `std::vector<std::pair<int, int>>::at` would otherwise do in the wrong places.
 * @param {string} s @returns {string[]}
 */
function splitQualified(s) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '<') depth++;
    else if (s[i] === '>') depth--;
    else if (depth === 0 && s[i] === ':' && s[i + 1] === ':') {
      parts.push(s.slice(start, i));
      i++;
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.filter(Boolean);
}

/** `deep` -> `4deep`, the way a mangled name spells one component of a qualified name. */
function component(name) {
  return `${name.length}${name}`;
}

/**
 * @param {string} demangled the name as a linker printed it
 * @returns {{plain: string} | {prefix: string, comps: string[]} | null}
 *   `plain` for a C symbol, which archives hold verbatim. Otherwise `prefix` is the front
 *   of the mangled name where it can be rebuilt exactly, and `comps` is every component in
 *   order (`['7__cxx11', '12basic_string', '6append']`) for the names where it cannot:
 *   a template class mangles its arguments into the middle of its own name, so the parts
 *   are all still there, in order, with other things between them.
 */
function manglePrefix(demangled) {
  const s = demangled.trim();
  if (!s) return null;

  const at = paramListAt(s);
  // No parameter list and no qualification means the linker had nothing to demangle: a C
  // function, an `extern "C"` one, or a plain variable. The archive holds it as printed.
  // `std::cout` has no parameter list either, and is `_ZSt4cout` in the archive.
  if (at < 0 && !s.includes('::')) return { plain: s };

  const qualifiers = at < 0 ? '' : s.slice(at).replace(/^\([^]*?\)/, '');
  const isConst = /\bconst\b/.test(qualifiers) && TRAILING.test(qualifiers);

  let head = stripTemplates(at < 0 ? s : s.slice(0, at)).trim();
  // An operator has no name in a mangled symbol at all: `operator delete(void*)` is
  // `_ZdlPv`, and the two letters standing in for it are a table this does not carry.
  // Saying so is the answer; building `_Z6delete` would be an answer that is wrong.
  if (/(?:^|::|\s)operator\b/.test(head)) return null;
  // A demangled template function carries its return type in front — `int tmpl<int>(int)` —
  // because the mangling encodes one. Ordinary functions never show a return type, so
  // whatever sits before the last space is a return type and not part of the name.
  const space = head.lastIndexOf(' ');
  if (space >= 0) head = head.slice(space + 1);

  const parts = splitQualified(head);
  if (!parts.length || (parts.length === 1 && parts[0].length < MIN_NAME)) return null;

  // A constructor and a destructor lose their names entirely — `~bad_alloc()` is `D2Ev`,
  // and which of D0/D1/D2 it is depends on what the compiler emitted. Dropping the member
  // leaves the class, which is the part that still spells itself out, and the mangled name
  // then continues straight into the tag: `_ZNSt9bad_alloc` + `D2Ev`.
  const last = parts[parts.length - 1];
  const structor = parts.length > 1 &&
    (last.startsWith('~') || last === parts[parts.length - 2]);
  const named = structor ? parts.slice(0, -1) : parts;

  if (named.length === 1 && !structor) return { prefix: `_Z${component(named[0])}`, comps: named.map(component) };

  // std::foo is `_ZSt3foo` with no nesting at all; anything deeper keeps the nesting and
  // abbreviates only the namespace: std::__cxx11::basic_string::append is
  // `_ZNSt7__cxx1112basic_string...`, where the template arguments then break the prefix
  // and the components are what still find it.
  const std = named[0] === STD;
  const rest = std ? named.slice(1) : named;
  const comps = rest.map(component);
  if (!comps.length) return null;
  if (std && rest.length === 1 && !structor) return { prefix: `_ZSt${comps[0]}`, comps };

  const nest = `${isConst ? 'NK' : 'N'}${std ? 'St' : ''}`;
  // A structor's prefix stops before the `E`, because the tag it cannot spell comes first.
  return { prefix: `_Z${nest}${comps.join('')}${structor ? '' : 'E'}`, comps };
}

module.exports = { manglePrefix };
