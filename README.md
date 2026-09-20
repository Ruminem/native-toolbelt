# Native Toolbelt

**English** · [한국어](#korean)

Small tools for native development on Windows, in one extension. Each one answers a question
that otherwise costs a trip to a command prompt.

## Check DLL dependencies

Right-click an `.exe` or `.dll` in the Explorer, or run **Native Toolbelt: Check DLL
Dependencies**. It lists every DLL the binary imports and where Windows would find it, and
says which ones it would not find at all.

```
C:\work\app\build\app.exe  (x64)

  ok KERNEL32.dll  —  C:\Windows\System32\KERNEL32.dll
  ok mylib.dll  —  C:\work\app\build\mylib.dll
 api api-ms-win-crt-runtime-l1-1-0.dll  —  API set, supplied by Windows
 !!  opencv_world480.dll [delay]  —  not on the search path, but here: C:\work\app\third_party\opencv_world480.dll
```

The names come out of the file itself, so nothing has to be installed — no Visual Studio, no
`dumpbin`. Delay-loaded DLLs are listed too, because they go missing just as loudly, only
later, at the first call into them.

A DLL that exists somewhere under the binary's folder but not on the search path is named
with its path, since that is usually a copy step that did not run rather than a lost file.

### What it cannot see

The loader also consults side-by-side manifests, `.local` redirection and directories a
program adds while running. Anything reported as **found** is found; anything reported as
**missing** may still be supplied by one of those. VS Code's own `Code.exe` is an example:
it loads `ffmpeg.dll` from a versioned subfolder.

## Decode a link error

Copy the linker output, or select it, and run **Native Toolbelt: Decode Link Error**. For
every `LNK2019` and `LNK2001` it names the symbol and lists the libraries on this machine
that define it.

```
LNK2019  ?declared_but_never_defined@@YAXH@Z
      in no library here — so it is missing from your own build

LNK2019  CreateFileW
      kernel32.Lib  (arm64, x64, x86)
      mincore.lib  (arm64, x64, x86)
      OneCore.Lib  (arm64, x64, x86)

searched 1524 libraries
```

Nothing has to be installed for this either. A static library carries the linker's own
symbol index in its first member, so answering *who defines this?* means reading 22 MB out
of a 600 MB SDK instead of starting `dumpbin` fifteen hundred times — under a second.

The architectures are part of the answer: a symbol found only under `x86` is the
32-bit/64-bit mismatch that the error message itself never mentions.

### GNU toolchains

MinGW and clang report the same failure in their own words, and those are read too. Paste
`undefined reference to` output from `ld` or `lld` and the answer has the same shape.

```
ld  __imp_CreateFileW
      libkernel32.a  (lib)
      libmincore.a  (lib)

ld  Renderer::flush(int)
      in no library here — so it is missing from your own build

ld  std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> >::append(char const*)
      libstdc++.a  (13-posix, 13-win32)

ld  operator delete(void*)
      an operator — a mangled name spells none, so this cannot be looked up
```

These linkers are harder to answer than MSVC, for the opposite reason. MSVC prints the
decorated name beside the readable one, so a lookup is a comparison. GNU ld demangles for
you, and `ns::deep(double)` matches nothing in an index that holds `_ZN2ns4deepEd`.

Mangling it back is not possible — the parameter types are spelled for a reader, and a
return type that never appears cannot be invented. But a mangled name puts the qualified
name first, each part written as its length followed by its letters, so the beginning of it
can be rebuilt exactly and matched as a prefix:

| the linker says | this looks for |
|---|---|
| `ns::deep(double)` | `_ZN2ns4deepE` |
| `K::cmethod(int) const` | `_ZNK1K7cmethodE` — `const` belongs to the front |
| `std::cout` | `_ZSt4cout` — `std` is never spelled out |
| `std::bad_alloc::~bad_alloc()` | `_ZNSt9bad_alloc` — a destructor keeps no name at all |

A template class writes its arguments into the middle of its own name, which breaks the
prefix; those are found by their components in order instead. Measured against the 7,204
mangled symbols in a libstdc++.a: the prefix places 37.8% exactly, the components place
another 46.8%, and the rest are the standard abbreviations for the stream types, which this
does not carry. An operator is reported as unanswerable rather than as absent, because
`operator delete(void*)` is `_ZdlPv` and spells no name to look for.

Archives are looked for under the GNU toolchain on PATH — `lib`, `lib/gcc/<target>/<version>`
and `<target>/lib` — as well as under MSVC and the Windows SDK, whichever error was pasted.
A MinGW install keeps 892 Win32 import libraries in the third of those, which is how
`__imp_CreateFileW` above comes back as `libkernel32.a`.

### Why not just read the docs

MS documents LNK2019 well and lists eighteen ways to cause it. What no document can list is
what is installed on your machine, which is the part that tells those eighteen apart — and
its own advice for that is to run `dumpbin` over your libraries by hand.

### Localized linker messages

In a Korean Visual Studio the English *referenced in function* is an empty string, so the
linker prints `plain_c_functionmain`: the symbol and the function that referenced it spelled
as one word. Rather than guess where the seam falls, this offers every prefix to the
archives and keeps the longest one something actually defines. When nothing matches, the
symbol is missing everywhere anyway, and it is reported under its fused name.

## Build

No dependencies to install.

```sh
npm test
npm run package   # produces native-toolbelt-<version>.vsix
```

`uitest.js` runs the commands inside a real extension host — activation, the clipboard,
the workspace search — against your installed VS Code, with no test framework. Its header
has the command line.

## License

Apache-2.0

---

## Korean

[English](#native-toolbelt) · **한국어**

윈도우 네이티브 개발에 쓰는 작은 도구를 확장 하나에 모음. 하나하나가 원래는 명령 프롬프트를
한 번 다녀와야 답이 나오는 질문임.

### DLL 의존성 점검

탐색기에서 `.exe`나 `.dll`을 오른쪽 클릭하거나 **Native Toolbelt: DLL 의존성 점검**을 실행함.
그 바이너리가 가져오는 DLL을 전부 보여 주고, 윈도우가 어디서 찾을지, 그리고 아예 못 찾는 것이
무엇인지 알려 줌.

```
C:\work\app\build\app.exe  (x64)

  ok KERNEL32.dll  —  C:\Windows\System32\KERNEL32.dll
  ok mylib.dll  —  C:\work\app\build\mylib.dll
 api api-ms-win-crt-runtime-l1-1-0.dll  —  API 세트, 윈도우가 제공함
 !!  opencv_world480.dll [delay]  —  검색 경로 밖에 있음: C:\work\app\third_party\opencv_world480.dll
```

이름은 파일에서 직접 읽음. 그래서 설치할 것이 없음 — Visual Studio도 `dumpbin`도 필요 없음.
지연 로드 DLL도 같이 보여 줌. 없으면 똑같이 터지고, 다만 처음 호출하는 순간으로 미뤄질 뿐임.

바이너리 폴더 어딘가에는 있는데 검색 경로에 없는 DLL은 그 경로를 같이 적음. 파일이 없어진 게
아니라 복사 단계가 안 돈 경우가 대부분이라서임.

### 못 보는 것

로더는 side-by-side 매니페스트, `.local` 리디렉션, 프로그램이 실행 중에 추가하는 디렉터리도
같이 봄. **찾음**이라고 한 것은 확실히 찾는 것이지만, **못 찾음**이라고 한 것은 그중 하나로
공급될 수도 있음. VS Code의 `Code.exe`가 그런 예임 — `ffmpeg.dll`을 버전 하위 폴더에서 불러옴.

### 링크 에러 해독

링커 출력을 복사하거나 선택한 뒤 **Native Toolbelt: 링크 에러 해독**을 실행함. `LNK2019`와
`LNK2001` 줄마다 심볼 이름을 뽑고, 이 PC 에서 그 심볼을 정의하는 라이브러리를 나열함.

```
LNK2019  ?declared_but_never_defined@@YAXH@Z
      이 PC 의 어느 라이브러리에도 없음 — 내 빌드에서 빠진 것임

LNK2019  CreateFileW
      kernel32.Lib  (arm64, x64, x86)
      mincore.lib  (arm64, x64, x86)
      OneCore.Lib  (arm64, x64, x86)

라이브러리 1524개를 뒤짐
```

이것도 설치할 것이 없음. 정적 라이브러리는 첫 멤버에 링커가 쓰는 심볼 인덱스를 들고 있어서,
*누가 이걸 정의하나?* 에 답하는 데 600MB 짜리 SDK 중 22MB 만 읽으면 됨 — `dumpbin` 을 천오백
번 띄우는 대신 1초 안임.

아키텍처도 답의 일부임. `x86` 아래에서만 나온 심볼은 에러 메시지가 한마디도 안 하는 32비트·
64비트 불일치임.

### GNU 툴체인

MinGW 와 clang 은 같은 실패를 제 말로 알리는데, 그쪽도 읽음. `ld` 나 `lld` 의
`undefined reference to` 출력을 붙여넣으면 답의 모양이 같음.

```
ld  __imp_CreateFileW
      libkernel32.a  (lib)
      libmincore.a  (lib)

ld  Renderer::flush(int)
      이 PC 의 어느 라이브러리에도 없음 — 내 빌드에서 빠진 것임

ld  std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> >::append(char const*)
      libstdc++.a  (13-posix, 13-win32)

ld  operator delete(void*)
      연산자임 — 맹글된 이름에는 이름이 안 들어가 조회할 수 없음
```

이쪽이 MSVC 보다 답하기 어려운데 이유가 정반대임. MSVC 는 데코레이트된 이름을 읽을 수 있는
이름 옆에 같이 찍어 줘서 조회가 그냥 비교임. GNU ld 는 친절하게 디맹글해 주는데, 인덱스에
들어 있는 것은 `_ZN2ns4deepEd` 라 `ns::deep(double)` 로는 하나도 안 맞음.

되맹글하는 것은 불가능함 — 인자 타입은 사람이 읽으라고 적힌 것이고, 아예 안 나오는 반환
타입을 지어낼 수는 없음. 다만 맹글된 이름은 수식된 이름을 맨 앞에 두고 각 조각을 길이 다음에
글자로 적으므로, **앞부분은 정확히 되살려** 접두사로 맞출 수 있음.

| 링커가 찍는 것 | 찾아보는 것 |
|---|---|
| `ns::deep(double)` | `_ZN2ns4deepE` |
| `K::cmethod(int) const` | `_ZNK1K7cmethodE` — `const` 는 뒤가 아니라 앞에 붙음 |
| `std::cout` | `_ZSt4cout` — `std` 는 풀어 쓰는 법이 없음 |
| `std::bad_alloc::~bad_alloc()` | `_ZNSt9bad_alloc` — 소멸자는 이름이 아예 안 남음 |

템플릿 클래스는 제 이름 한가운데에 인자를 써 넣어서 접두사가 깨짐. 그런 것은 대신 컴포넌트가
순서대로 나오는지로 찾음. libstdc++.a 의 맹글된 심볼 7,204개에 돌려 봄 — 접두사가 37.8% 를
정확히 짚고, 컴포넌트가 46.8% 를 더 짚음. 남는 것은 스트림 타입의 표준 축약인데 그 표는 안
들고 있음. 연산자는 "없음"이 아니라 "조회할 수 없음"으로 알림. `operator delete(void*)` 는
`_ZdlPv` 라 찾아볼 이름이 하나도 안 적혀 있기 때문임.

아카이브는 MSVC·윈도우 SDK 아래뿐 아니라 PATH 위의 GNU 툴체인 아래에서도 찾음 — `lib`,
`lib/gcc/<타깃>/<버전>`, `<타깃>/lib`. 어느 쪽 에러를 붙여넣었든 둘 다 봄. MinGW 설치본은
셋째 자리에 Win32 import 라이브러리 892개를 두고 있고, 위의 `__imp_CreateFileW` 가
`libkernel32.a` 로 돌아오는 게 그 덕임.

### 문서를 읽으면 되지 않나

MS 는 LNK2019 를 잘 설명해 두었고 원인을 열여덟 가지나 적어 둠. 어느 문서도 못 적는 것은 내 PC
에 무엇이 깔려 있느냐인데, 그 열여덟 가지를 가르는 게 바로 그것임. 그리고 그 문서가 시키는
방법이 `dumpbin` 을 라이브러리마다 손으로 돌려 보라는 것임.

### 번역된 링커 메시지

한국어 Visual Studio 에서는 영어의 *referenced in function* 이 빈 문자열이라 링커가
`plain_c_functionmain` 처럼 찍음 — 심볼과 그걸 참조한 함수가 한 단어로 붙어 나옴. 경계가
어디인지 짐작하는 대신 접두사를 전부 아카이브에 물어보고, 실제로 무언가가 정의하는 가장 긴
것을 취함. 아무것도 안 걸리면 어차피 어디에도 없는 심볼이므로 붙은 이름 그대로 보고함.

### 직접 빌드하기

설치할 의존성 없음.

```sh
npm test
npm run package   # native-toolbelt-<version>.vsix 생성
```

`uitest.js` 는 명령을 실제 확장 호스트 안에서 돌려 봄 — 활성화, 클립보드, 워크스페이스
검색까지. 이미 깔려 있는 VS Code 로 돌리고 테스트 틀은 안 씀. 실행 명령줄은 그 파일 맨 위
주석에 있음.

### 라이선스

Apache-2.0
