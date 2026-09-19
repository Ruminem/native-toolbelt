# NEXT

- **여기까지 됨** — 기능 두 개.
  - **DLL 의존성 점검** (0.1.0). PE 파일을 직접 읽어 일반·지연 임포트를 뽑고 윈도우 검색
    순서(exe 폴더 → System32/SysWOW64 → PATH)대로 찾음. 못 찾은 것이 바이너리 폴더 안에 있으면
    그 경로를 같이 알려 줌. 실제 빌드 산출물(Catch2 MinGW 빌드)로 대조 실험함 — PATH 가
    정상이면 "0 missing" 이고 실제로 돌아가며, PATH 에서 mingw 를 빼면 `libgcc_s_seh-1.dll`·
    `libstdc++-6.dll` 을 못 찾는다고 보고하고 실행도 `0xC0000135` 로 죽음
  - **링크 에러 해독** (0.2.0). `LNK2019`·`LNK2001` 에서 심볼을 뽑아 어느 `.lib` 에 있는지 찾음.
    정적 라이브러리 첫 멤버의 심볼 인덱스만 읽음 — 598MB 중 22.5MB, 1524개 아카이브에 1초 안팎
    (콜드 1.4초, 워엄 0.5초, 한 번 12초 이상치 관측). 외부 프로세스 없음
  - 0.1.1 로 아이콘 넣어 마켓플레이스 게시했고 https://ruminem.github.io/vsx-tools/ 목록에도 올림
  - `uitest.js` 로 **실제 확장 호스트 안에서** 두 명령을 돌려 확인함 — 활성화, 명령 등록,
    클립보드 읽기, 워크스페이스 검색, 진행 표시까지. 틀 없이 `code --extensionTestsPath` 만 씀
  - **0.2.0 을 마켓플레이스까지 게시함** (2026-09-19). 태그 `v0.2.0`, GitHub 릴리스에 `.vsix` 첨부,
    vsx-tools 목록과 프로필 README 설명도 두 도구 기준으로 고침
- **다음 할 것** — `메모리 릭` 절의 30분 스파이크. 그 결과로 릭 기능을 만들지 접을지가 갈린다.
  그것과 별개로 제일 싼 후보는 여전히 MinGW `ld` 의 `undefined reference to` 붙이기
  (`ar.js` 가 `.a` 를 이미 읽으므로 파싱만 붙이면 됨).
- **막힌 것** — 릭 기능은 **만들 값어치가 아직 확인되지 않았다**. `메모리 릭` 절을 먼저 읽을 것.
  나머지는 없음. 아래 "아는 한계" 참고.

## 이 확장의 성격

작은 네이티브 개발 도구를 한 확장에 모으는 잡화점이다. 기능마다 명령 하나, 공용 코드는
`pe.js`(PE 읽기)·`resolve.js`(DLL 찾기)·`ar.js`(아카이브 심볼 인덱스 읽기)·
`linkerror.js`(에러 파싱과 심볼 검색)처럼 파일로 나눠 둔다. 기능이 늘면 설정으로 켜고 끌 수
있게 한다.

## 링크 에러 해독에서 아는 한계

- **영어 링커 메시지는 실물로 확인하지 못했다.** 이 PC 에 한국어 언어 팩만 깔려 있어
  `VSLANG=1033` 도 안 먹는다. 테스트의 영어 픽스처는 MS 문서 표기대로 손으로 적은 것이다
- **심볼보다 짧은 이름으로 참조하는 함수가 있고 그 함수가 라이브러리에 있으면 틀릴 수 있다.**
  줄의 첫 토큰만 조회해서 막아 두었지만, 첫 토큰이 심볼이 아닌 언어가 있으면 깨진다
- 각 제품의 **최신 버전 폴더 하나만** 뒤진다. 옛 SDK 를 고정해 쓰는 프로젝트는 못 찾는다
- MinGW `ld` 의 `undefined reference to` 는 아직 안 다룬다. `ar.js` 는 `.a` 도 읽으므로
  파싱만 붙이면 된다

## 다음에 붙일 후보

바로 확장 기능으로 갈 것:

- **전처리·어셈블리 열기** — 현재 파일의 컴파일 명령을 `compile_commands.json` 에서 꺼내
  전처리 결과나 어셈블리를 새 탭에. 가장 작음
- **크래시 덤프 열기** — `.dmp` 에서 `cdb` 로 콜스택을 뽑아 편집기로. 우리 소스면 그 줄로 이동.
  **이 PC 에 `cdb` 없음** (2026-09-19 확인 — PATH 와 `Windows Kits\10\Debuggers` 둘 다 없음.
  디버깅 도구를 따로 깔아야 함)

죽은 뒤의 텍스트를 풀어 주는 것 (2026-09-19 검토). 링크 에러 해독과 같은 꼴 — 도구가 이미 찍은
출력을 파싱해 프레임 목록을 띄우고 소스 줄로 이동. 분석은 직접 안 함. 실행 중 디버깅 UI(중단점·
변수·스텝)는 cpptools·CodeLLDB 가 이미 하므로 안 만듦:

- **gdb 콜스택** — **우선순위 내림 (2026-09-19).** 코어덤프는 이미 Jenkins 스크립트로 운용 중이라
  급하지 않음. `gdb -batch -ex "thread apply all bt"` 나 CI 로그의 backtrace 를 파싱하는 것 자체는
  여전히 쉬움. 이 PC 에 gdb 17.2(WinLibs MinGW, 파이썬 켜짐)와 lldb(LLVM 22) 있음.
  **안 재 본 것**: MinGW gdb 가 clang/MSVC 의 PDB 심볼을 읽는지
- **메모리 오염** — ASan 리포트(`heap-use-after-free`, `heap-buffer-overflow`)를 파싱해 접근·할당·
  해제 스택 세 개를 나란히. 쉬움~중간. ASan 런타임은 clang 22 와 MSVC 14.44 에 있고 MinGW GCC 에는
  `libasan` 이 없음. **안 재 본 것**: 윈도우 ASan 리포트의 프레임 줄 형식 실물 — 작은
  use-after-free 예제를 clang 으로 빌드해 한 번 찍어 보면 됨
- **메모리 릭** — 2026-09-19 에 깊이 파 봤다. 아래 `메모리 릭` 절이 전부다. 결론이 "만들지 말지
  아직 모름" 이라 다음 할 일이 스파이크 하나다

v0 로 잡으면 "클립보드의 gdb backtrace / ASan 리포트 → 프레임 목록 → 소스로 이동" 명령 하나.
두 형식 다 `#N 0x… in func file:line` 꼴이라 파서 하나에 정규식 둘. 주로 어떤 빌드(MinGW gcc /
clang / MSVC)의 문제를 볼지가 콜스택 쪽 도구를 가름 — 아직 안 정함

### 리눅스 코어덤프를 윈도우에서 여는 것 (2026-09-19 확인, 결론: 안 됨)

우분투 20.04 빌드의 코어덤프를 윈도우 gdb 로 열 수 있는지 재 봤다.

- **이 PC 의 MinGW gdb 17.2 에는 리눅스 osabi 가 없다.** `set osabi` 의 유효값이
  `auto, default, none, SVR4, none, Windows, Cygwin` 뿐이다
- 다만 **ELF·DWARF 자체는 읽는다** — clang `--target=x86_64-unknown-linux-gnu` 로 만든 ELF64
  오브젝트를 열어 `int f(int)` 를 정상으로 보여 줬다. 코어를 해석할 부분만 빠진 것이다
- **추정(실물 코어로 확인 못 함)**: 코어의 레지스터·스레드는 `NT_PRSTATUS` 같은 리눅스 전용 노트에
  있고 그걸 읽는 linux-tdep 이 없으니 못 연다. 리눅스 코어 파일 하나면 30초에 확정된다
- **gdb 를 바꿔도 sysroot 가 남는다.** 스택이 `libc.so.6`·`ld-linux` 프레임을 지나므로 우분투
  20.04 그 빌드의 바이너리와 심볼이 있어야 풀린다. 그래서 윈도우 안이라면 WSL2 로 20.04 를
  띄우는 게 제일 싸다. 20.04 는 2025-04 EOL 이라 스토어 목록에서 빠졌을 수 있다(확인 못 함 —
  이 PC 에 WSL 이 없어 `wsl -l -o` 가 안 돈다). 빠졌으면 rootfs tarball 을 `wsl --import`
- 이 PC 의 `lldb`(LLVM 22)는 `python311.dll` 이 없어 아예 실행되지 않는다. WSL·Docker 도 없다

## 메모리 릭 — 2026-09-19 조사 (여기부터 이어서)

**결론부터: 만들지 말지가 아직 안 정해졌다.** 아래 스파이크 하나로 갈린다. 그 전에 파서나 UI 를
더 설계하면 안 된다 — 이번 세션에서 실물 리포트를 한 번도 못 본 채로 설계를 쌓다가 되돌렸다.

### 잰 것 — 윈도우에서 sanitizer 릭 검출은 불가능

| 잰 것 | 결과 |
|---|---|
| `clang -fsanitize=leak` | `unsupported option '-fsanitize=leak' for target 'x86_64-pc-windows-msvc'` |
| ASan 빌드 + `ASAN_OPTIONS=detect_leaks=1` | `AddressSanitizer: detect_leaks is not supported on this platform.` 종료코드 1 |
| 런타임 파일 | clang 22·MSVC 14.44 둘 다 `clang_rt.asan*` 만 있고 `lsan` 은 없음 |

`drmemory`·`valgrind`·`umdh`·`gflags` 도 이 PC 에 전부 없다. (전에 "아는 것, 돌려 보진 않음"으로
적어 둔 항목이 이제 실측이다.)

### 잰 것 — CRT 디버그 힙의 실물 출력

`/MDd` + `_CrtSetDbgFlag(_CRTDBG_ALLOC_MEM_DF|_CRTDBG_LEAK_CHECK_DF)` 로 네 벌을 빌드해 받았다.
**맥에서는 다시 못 재므로 실물을 그대로 남긴다.**

- **리디렉션 없이 돌리면 터미널에 아무것도 안 나온다.** 기본 목적지가 디버거 출력 창이다.
  `_CrtSetReportMode(_CRT_WARN, _CRTDBG_MODE_FILE)` 와
  `_CrtSetReportFile(_CRT_WARN, _CRTDBG_FILE_STDOUT)` 를 넣어야 stdout 으로 온다
- `_CRTDBG_MAP_ALLOC` 없음 — 파일·줄이 안 붙는다:
  ```
  Detected memory leaks!
  Dumping objects ->
  {109} normal block at 0x000002826699B0B0, 7 bytes long.
   Data: <       > CD CD CD CD CD CD CD
  Object dump complete.
  ```
- `_CRTDBG_MAP_ALLOC` 만 (C++) — `malloc` 은 붙고 **`new` 는 안 붙는다**:
  ```
  crtleak.cpp(15) : {109} normal block at 0x0000017A6025B380, 7 bytes long.
  {108} normal block at 0x0000017A6025B240, 16 bytes long.
  ```
- `#define DBG_NEW new (_NORMAL_BLOCK, __FILE__, __LINE__)` + `#define new DBG_NEW` 까지 — `new` 도 붙는다:
  ```
  crtleak.cpp(14) : {108} normal block at 0x00000206475CB650, 16 bytes long.
  ```

실제 C++ 릭은 대개 `new` 에서 나므로, **`_CRTDBG_MAP_ALLOC` 만 켠 프로젝트는 정작 중요한 릭에
파일·줄이 없다.** 파일 이름은 **상대 경로**(`crtleak.cpp`)로 나온다 — `__FILE__` 이 그대로라
워크스페이스 검색으로 찾아야 한다. `{109}` 는 할당 순번이고 `_CrtSetBreakAlloc(109)` 로 다음
실행에서 그 지점에 멈출 수 있다 (`crtdbg.h:230` 선언, 릴리스 빌드에선 `crtdbg.h:148` 에서
no-op). 순번이 실행마다 같아야 먹히므로 멀티스레드면 흔들린다.

### 잰 것 — VS Code 가 이미 해 주는 것

`tasks.json` problemMatcher 의 `"fileLocation": ["search", {include/exclude}]` 가 **있다.** 설치본
1.138.0 의 `out/nls.messages.json` 에서 확인했다 — *"performs a deep (and, possibly, heavy) file
system search"*. **공식 문서 페이지에는 안 적혀 있다** (`relative`/`absolute`/`autoDetect` 만
나온다). multiline 패턴 + `"loop": true` 로 스택도 먹는다.

즉 **리포트 → Problems 패널 → 클릭해 소스 이동까지는 확장 코드 0줄로 된다.** 확장에 남는 고유한
몫은 둘뿐이다 — 스택에서 워크스페이스 안 첫 프레임에 귀속시키는 것, 그리고 바이트 집계·순위
(problemMatcher 는 프레임마다 항목을 하나씩 내고 숫자를 더할 줄 모른다).

### 설계에서 걸러진 것

- **규모별(줄·파일·폴더·프로젝트) "검사"는 성립하지 않는다.** 릭은 소스가 아니라 실행의 성질이라
  LSan·Valgrind 에 범위 개념이 없다. 규모별 **집계**만 가능하고, 그건 파싱 결과를 굴리는 것이라 싸다
- 집계에서 direct 와 indirect 를 같이 더하면 **같은 메모리를 두 번 센다.** 기본은
  direct/definitely 만. Valgrind 의 `still reachable` 은 전역·싱글턴이라 안 거르면 총합을 덮는다
- 귀속은 스택 맨 위(`#0` = `malloc`/`operator new`)가 아니라 **워크스페이스 안에서 처음 걸리는
  프레임**이어야 한다
- 리포트가 주는 것은 **할당 지점**이지 버그 지점이 아니다. "이 줄이 릭"이라고 쓰면 오해를 만든다
- CRT 리포트에 파일·줄이 없을 때 "파일 정보 없음"으로 묶어 보여주는 것은 **아무 행동으로도
  이어지지 않는다.** 대신 리포트만 보고 원인을 판별해 고칠 줄을 띄운다 — 일부만 붙어 있으면
  `DBG_NEW` 가 없는 것, 전부 없으면 `_CRTDBG_MAP_ALLOC` 이 없는 것

### 막힌 지점과 다음 스파이크 (30분)

**확장이 끝까지 책임지지 않으면 존재 이유가 약하다.** 사용자가 직접 켜고 돌리고 로그를 복사해 와야
붙는 물건이면 `tasks.json` 한 장으로 충분하다. 끝까지 가려는데 걸리는 것:

1. 윈도우 sanitizer 릭 검출 불가 (측정됨)
2. CRT 는 기본 상태로 출력이 안 보임 (측정됨)
3. 리눅스는 LSan 이 소스 수정 0으로 다 해 주는데 **그게 도는 곳이 Jenkins** 라 확장 손이 안 닿는다

2번을 뒤집으면 길이 나온다 — 출력이 디버거 창으로 간다는 건 **확장이 그 창의 주인**이라는 뜻이다.
`DebugAdapterTracker` 로 디버그 세션의 `output` 이벤트를 가로채면, F5 로 평소처럼 돌리기만 해도
확장이 CRT 덤프를 자동으로 줍는다. 로그 복사도 리디렉션 코드도 필요 없다.

**스파이크**: 작은 `/MDd` 예제를 cpptools 로 F5 돌리고 `DebugAdapterTracker` 에 덤프가 잡히는지만
본다. 이 PC 에 `ms-vscode.cpptools` 1.34.4 가 있다.

- 잡히면 → 릭 기능에 존재 이유가 생긴다. 그때 파서·귀속·집계를 만든다
- 안 잡히면 → **릭 기능은 접는다.** `tasks.json` 예시 한 장을 저장소에 넣고 여기에 "안 됨"으로 적는다
- `_CrtSetDbgFlag` 호출은 여전히 필요하다. 디버거 `evaluate` 로 대신 켤 수 있는지도 같이 본다

**맥북에서 이어갈 때**: 위 측정은 전부 윈도우 것이고 맥에서는 다시 못 잰다. 맥은 판이 다르다 —
CRT 는 아예 없고, clang ASan 의 릭 검출이 macOS 에서 되는지부터 다시 재야 한다(안 재 봤다).
스파이크의 `DebugAdapterTracker` 부분만 플랫폼과 무관하다. 재현용 예제는 세션 임시 폴더에만
있었으므로 맥에서는 위 출력 블록을 픽스처로 쓰면 된다.

## 스크립트로 먼저 재 볼 것

스크립트로 먼저 재 보고 쓸 만하면 기능으로 올릴 것 (결과가 보고서라 UI 없이도 판단됨):

- **재컴파일 영향 범위** — 이 헤더를 고치면 몇 개 TU 가 다시 컴파일되는지
- **안 쓰는 include 찾기** — 하나씩 지우고 그 파일만 다시 컴파일해 통과하면 표시
- **PCH 후보 추천** — 많이 포함되면서 거의 안 바뀌는 헤더 (포함 횟수 + git 변경 빈도)
- **헤더별 컴파일 시간** — clang `-ftime-trace`, MSVC `/d1reportTime` 결과를 순위로

위 네 가지는 `compile_commands.json` 이 있어야 한다. MSBuild 프로젝트에는 그 파일이 없고,
CMake 도 Makefile·Ninja 제너레이터에서만 만든다 (`cmake --help-variable
CMAKE_EXPORT_COMPILE_COMMANDS` 로 확인함).

## 이 PC 의 도구

- VS Build Tools 17.14.41, C++ 워크로드. `cl.exe`·`link.exe`·`lib.exe`·`dumpbin.exe`·
  `undname.exe` 가 `VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64` 에 있음
- Windows SDK `10.0.26100.0`
- Visual Studio IDE 는 없음. 언어 팩은 한국어만

## 규칙

전역 규칙(`~/.claude/CLAUDE.md` → `c:\dev\rules\src`)을 따른다. 이 저장소에서 특히 걸리는 것:

- UI 문구는 영어 원문 + 한국어 번역. `package.json` 은 `%키%` 와 `package.nls*.json`,
  코드 안 문구는 `vscode.l10n.t()` 와 `l10n/bundle.l10n.ko.json`. 번역이 빠지면 `npm test` 가
  실패한다
- README 는 영어·한국어를 한 파일에. 한쪽을 고치면 같은 커밋에서 다른 쪽도 고친다
- 버전을 올리는 커밋에서 `CHANGELOG.md` 를 같이 고친다. 릴리스 노트는 그 내용을 그대로 옮긴다
- 의존성은 아직 하나도 없다. 추가하기 전에 라이선스를 확인하고 알린다
