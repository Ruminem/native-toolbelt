<!-- What github.com/Ruminem says about this repository. Ruminem/Ruminem's build_readme.py
     copies both sections into the profile README. Say when you would reach for it first,
     then how it works; keep the two languages saying the same thing. -->

## English

For the native build that runs on your machine and nowhere else: it reads an `.exe` or
`.dll` and says which DLLs it needs, where Windows would find each one, and which ones
it would not find at all, delay-loaded imports included. Paste a linker's `LNK2019` and
it names the libraries here that define the symbol, and the architectures they were
found under — the part a 32-bit/64-bit mismatch hides in. Both read the files
themselves, so no Visual Studio and no `dumpbin`.

## Korean

내 PC에서만 안 도는 네이티브 빌드를 볼 때 씀. `.exe`나 `.dll`을 읽어 어떤 DLL이
필요한지, 윈도우가 그걸 어디서 찾을지, 아예 못 찾는 게 무엇인지 알려 줌. 지연 로드
임포트도 같이 셈. 링커가 낸 `LNK2019`를 붙여넣으면 그 심볼을 정의하는 라이브러리를 이
PC에서 찾아 어느 아키텍처에서 나왔는지까지 알려 줌 — 32비트·64비트 불일치가 숨는
자리임. 둘 다 파일을 직접 읽으므로 Visual Studio도 `dumpbin`도 필요 없음.
