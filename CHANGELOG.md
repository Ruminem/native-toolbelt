# Changelog

## Unreleased

- **Decode Link Error** now reads GNU `ld` as well, so MinGW gcc builds are covered:
  every `undefined reference to` line gives up its symbol and is answered with the
  libraries that define it, exactly as an `LNK2019` is.
- `ld` quotes the symbol, so its names are taken whole instead of being guessed at, and the
  repeated lines it prints for one symbol — one per reference — are folded into one answer.
- A C++ name that `ld` demangled cannot be found in any archive index, which holds the
  mangled form. That is now said as such, with the `-Wl,--no-demangle` flag that prints the
  name an index can match, rather than reported as a symbol that exists nowhere.

**한국어**

- **링크 에러 해독** 이 GNU `ld` 도 읽어서 MinGW gcc 빌드까지 다룸. `undefined reference to`
  줄마다 심볼을 뽑고 그것을 정의하는 라이브러리를 알려 줌 — `LNK2019` 와 똑같이 답함
- `ld` 는 심볼을 따옴표로 감싸므로 이름을 짐작하지 않고 통째로 가져옴. 한 심볼에 참조마다 한 줄씩
  여러 번 찍는 것은 한 답으로 접음
- `ld` 가 demangle 한 C++ 이름은 맹글된 이름을 들고 있는 아카이브 인덱스에서 절대 안 걸림.
  이제 그것을 어디에도 없는 심볼이라고 하지 않고, 인덱스가 맞춰 볼 수 있는 이름으로 찍게 하는
  `-Wl,--no-demangle` 과 함께 그렇다고 말해 줌

## 0.2.0 — 2026-09-19

- Second tool: **Decode Link Error**. Paste or select linker output and it names the symbol
  behind every `LNK2019` and `LNK2001`, then lists the libraries on this machine that define
  it — with the architectures each one was found under, so a 32-bit/64-bit mismatch shows up
  as a symbol that exists only under `x86`.
- It reads the symbol index each static library carries in its first member, so nothing has
  to be installed and a full search of MSVC and the Windows SDK takes about a second.
- Decorated names are read straight out of the error, and a plain C name fused to its
  calling function by a localized message is resolved by asking the archives where the name
  ends.

**한국어**

- 두 번째 도구: **링크 에러 해독**. 링커 출력을 붙여넣거나 선택하면 `LNK2019`·`LNK2001` 마다
  심볼 이름을 뽑고, 이 PC 에서 그 심볼을 정의하는 라이브러리를 알려 줌. 어느 아키텍처에서
  나왔는지도 같이 보여 주므로 `x86` 에서만 나오면 32비트·64비트 불일치인 것이 드러남
- 정적 라이브러리가 첫 멤버에 들고 있는 심볼 인덱스를 읽음. 그래서 설치할 것이 없고, MSVC 와
  윈도우 SDK 를 전부 뒤지는 데 1초쯤 걸림
- 맹글된 이름은 에러에서 바로 읽고, 번역된 메시지 때문에 호출 함수와 붙어 버린 C 심볼은 이름이
  어디서 끝나는지를 아카이브에 물어 가름

## 0.1.1 — 2026-09-18

- The extension now has its own icon in the Marketplace and the Extensions view.

**한국어**

- 마켓플레이스와 확장 목록에 이 확장만의 아이콘이 생김

## 0.1.0 — 2026-09-18

- First feature: **Check DLL Dependencies**. Right-click an `.exe` or `.dll` to see every DLL
  it imports, where Windows would find each one, and which ones it would not find.
- Delay-loaded imports are listed too, marked `[delay]`.
- A missing DLL that exists elsewhere under the binary's folder is reported with its path.
- Reads the PE file directly, so no Visual Studio or `dumpbin` is needed.

**한국어**

- 첫 기능: **DLL 의존성 점검**. `.exe` 나 `.dll` 을 오른쪽 클릭하면 그 바이너리가 가져오는 DLL
  을 전부 보여 주고, 윈도우가 각각을 어디서 찾을지, 아예 못 찾는 것이 무엇인지 알려 줌
- 지연 로드 DLL 도 `[delay]` 로 표시해 같이 보여 줌
- 못 찾은 DLL 이 바이너리 폴더 어딘가에 있으면 그 경로를 같이 적음
- PE 파일을 직접 읽으므로 Visual Studio 도 `dumpbin` 도 필요 없음
