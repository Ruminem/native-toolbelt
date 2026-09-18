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

## Build

No dependencies to install.

```sh
npm test
npm run package   # produces native-toolbelt-<version>.vsix
```

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

### 직접 빌드하기

설치할 의존성 없음.

```sh
npm test
npm run package   # native-toolbelt-<version>.vsix 생성
```

### 라이선스

Apache-2.0
