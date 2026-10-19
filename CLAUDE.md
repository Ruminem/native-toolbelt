# native-toolbelt

윈도우 네이티브 개발용 작은 도구를 한 확장에 모은 잡화점. 순수 JavaScript, 의존성도 빌드도 없다.
기능마다 명령 하나, 공용 코드는 파일로 나눈다. 기능이 늘면 설정으로 켜고 끌 수 있게 한다.
기능 후보·측정 기록·아는 한계·이 PC 의 툴체인은 진행 메모(notes 저장소 `progress/native-toolbelt/NEXT.md`)에 있다 — 새 기능은 거기 적힌 결론부터 읽는다.

## 파일 지도

| 파일 | 책임 |
|---|---|
| `extension.js` | `vscode` 를 부르는 유일한 파일. 두 명령 등록, 출력 창, 진행 표시, 선택 영역·클립보드 읽기, 워크스페이스의 `.lib`·`.a` 찾기 |
| `pe.js` | PE 파일에서 아키텍처와 일반·지연 임포트 DLL 이름 읽기 |
| `resolve.js` | 임포트한 DLL 을 윈도우 검색 순서(exe 폴더 → System32/SysWOW64 → PATH)로 찾기. API set(`api-ms-win-*`)은 파일이 없는 게 정상 |
| `ar.js` | 정적 라이브러리(`.lib`·`.a`) 첫 멤버의 심볼 인덱스만 읽기. MSVC·GNU 공용 |
| `mangle.js` | GNU 링커가 디맹글해 찍은 이름에서 Itanium 맹글 이름의 앞부분을 되살림 |
| `linkerror.js` | 링크 에러(MSVC `LNK2019`·`LNK2001`, GNU `ld`·`lld`) 파싱, MSVC·SDK·MinGW 라이브러리 폴더 찾기, 심볼 검색 |
| `test.js` | `npm test`. 노드만 있으면 됨 |
| `uitest.js` | 실제 확장 호스트 안에서 두 명령을 돌리는 검사. 띄우는 명령은 파일 머리 주석에 있음 |
| `test-gnu.a` · `test-gnu-decoy.a` | GNU ar 로 만든 진짜 아카이브 픽스처 |
| `package.nls*.json` · `l10n/` | 명령 제목과 코드 안 문구의 한국어 번역 |

의존 방향은 `extension.js` → `pe`·`resolve`·`linkerror` → `ar`·`mangle` 하나뿐이다. 아래쪽은 `vscode` 를
부르지 않아서 `test.js` 가 에디터 없이 잰다. 새 파싱·검색 코드도 아래쪽에 둔다.

## 고칠 때

- 명령을 더하면 `package.json` 의 `%키%` → `package.nls.json`·`package.nls.ko.json` → `extension.js` 등록 →
  코드 안 문구는 `vscode.l10n.t()` 와 `l10n/bundle.l10n.ko.json` 순서로 간다. `npm test` 가 빠진 번역과
  안 쓰는 번역을 둘 다 잡는다
- 파서나 검색을 고쳤으면 `npm test`(1.5초, 2026-10-11). 활성화·클립보드·진행 표시처럼 배선을 고쳤으면
  `uitest.js` 까지 돌린다 — `test.js` 는 `extension.js` 를 안 부른다
- 파일을 새로 더하면 `.vscodeignore` 에 넣을지 본다. 거기는 실을 것이 아니라 **뺄 것**을 적는 목록이라
  안 적으면 VSIX 에 실린다 (2026-10-11 `vsce ls` 에 이 파일과 `.a` 픽스처 둘이 실려 있었다)

## 함정

- **`ok` 가 떠도 윈도우 쪽은 안 돌았을 수 있다.** `notepad.exe` 가 없으면 PE·DLL 검사를 말없이 건너뛰고,
  MSVC·SDK 가 없으면 `ok (MSVC·SDK 가 없어 그쪽 아카이브 검사만 건너뜀)` 을 찍는다. 맥·리눅스에서는
  GNU 쪽과 파서만 잰 것이다
- **아카이브 픽스처의 원본 소스는 저장소에 없다.** 들어 있어야 할 심볼 목록은 `test.js` 단언에 있다.
  `test-gnu-decoy.a` 는 접두사 매칭을 지워도 테스트가 통과하는 것을 막으려고 둔 것이라, 다시 만들면
  `ns::inner::deep` 같은 미끼 심볼을 빼먹지 않는다
- **MSVC 영어 메시지는 실물이 아니다.** 이 PC 에 한국어 언어 팩만 있어 `VSLANG=1033` 도 안 먹는다.
  한국어 픽스처는 실제 링커 출력이고, 영어는 MS 문서 문구를 옮겨 적은 것이다
- MSVC·SDK 폴더는 vswhere 를 돌리지 않고 `Program Files` 아래 레이아웃으로 찾고, 제품마다 최신 버전
  폴더 하나만 본다. MinGW 는 PATH 의 `gcc` 자리에서 한 단계 올라가 찾는데, 윈도우 실물 MinGW 에서는
  아직 안 쟀다(진행 메모)

## 측정 (클라우드 세션만)
이 저장소를 연 클라우드 세션은 규칙이 안 실린 대조군이라 `ruminem/rules` 의 측정 로그에 행을 남긴다.
작업 브랜치에 푸시할 때마다 그 뒤에 한 번 한다.
1. `add_repo`(`ruminem` / `rules`, access `push`) 를 부르고, 알려 주는 명령으로 클론한다. 이미 있다고 하면 알려 준 자리를 그대로 쓴다
2. `python3 <add_repo 가 알려 준 경로>/session-breakdown.py --push`
- `register_repo_root` 는 부르지 않는다. 부르면 rules 의 CLAUDE.md 가 실려 대조군이 깨진다
- 실패하면 이유를 한 줄 알리고 넘어간다. 이것 때문에 하던 일을 멈추지 않는다
- 개인 PC 에서 열었으면 할 일 없다 — 자정 작업이 PC 기록을 훑는다
