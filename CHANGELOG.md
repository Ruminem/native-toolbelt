# Changelog

## 0.3.0 — 2026-09-20

- **Decode Link Error** now reads GNU `ld` and `lld` as well as MSVC, so a MinGW or clang
  build gets the same answer: paste `undefined reference to 'ns::deep(double)'` and it names
  the libraries on this machine that define it.
- These linkers demangle the name before printing it, which is the whole difficulty — the
  archive index holds `_ZN2ns4deepEd` and matches nothing you can read. The mangled name is
  rebuilt from the front, as far as it can be rebuilt exactly, and matched as a prefix; a
  template class writes its arguments into the middle of its own name, so those are found by
  their components in order instead.
- Archives are now looked for under the GNU toolchain on PATH as well as under MSVC and the
  Windows SDK — `lib`, `lib/gcc/<target>/<version>` and `<target>/lib`, where a MinGW
  install keeps libstdc++, libgcc and the 892 Win32 import libraries.
- An operator reports as unanswerable rather than as absent. `operator delete(void*)` is
  `_ZdlPv`, spelling no name at all, and "in no library here" would send you to look at your
  own build over a question that was never asked.
- A library reachable through two paths to the same folder is read once, not twice. A PATH
  carrying both `/usr/bin` and `/bin` was finding 188 archives where there are 94.

**한국어**

- **링크 에러 해독**이 MSVC 에 더해 GNU `ld` 와 `lld` 도 읽음. MinGW 나 clang 으로 빌드해도
  같은 답이 나옴 — `undefined reference to 'ns::deep(double)'` 을 붙여넣으면 이 PC 에서 그
  심볼을 정의하는 라이브러리를 알려 줌
- 이 링커들은 이름을 디맹글해서 찍는데 그게 바로 어려운 지점임. 아카이브 인덱스에 들어 있는
  것은 `_ZN2ns4deepEd` 라 읽을 수 있는 쪽과는 하나도 안 맞음. 그래서 맹글된 이름의 앞부분을
  정확히 되살릴 수 있는 데까지 되살려 접두사로 맞춤. 템플릿 클래스는 제 이름 한가운데에
  인자를 써 넣으므로 그런 것은 대신 컴포넌트가 순서대로 나오는지로 찾음
- 아카이브를 MSVC·윈도우 SDK 뿐 아니라 PATH 위의 GNU 툴체인 아래에서도 찾음 — `lib`,
  `lib/gcc/<타깃>/<버전>`, `<타깃>/lib`. MinGW 설치본이 libstdc++·libgcc 와 Win32 import
  라이브러리 892개를 두는 자리임
- 연산자는 "없음"이 아니라 "조회할 수 없음"으로 알림. `operator delete(void*)` 는 `_ZdlPv` 라
  이름이 아예 안 들어가는데, "어느 라이브러리에도 없음"이라고 하면 묻지도 않은 질문을 두고
  제 빌드를 뒤지러 가게 됨
- 같은 폴더로 이어지는 경로가 둘이면 한 번만 읽음. PATH 에 `/usr/bin` 과 `/bin` 이 같이 있으면
  94개인 아카이브를 188개로 세고 있었음

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
