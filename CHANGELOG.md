# Changelog

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
