# Changelog

## 0.1.0 — 2026-09-18

- First feature: **Check DLL Dependencies**. Right-click an `.exe` or `.dll` to see every DLL
  it imports, where Windows would find each one, and which ones it would not find.
- Delay-loaded imports are listed too, marked `[delay]`.
- A missing DLL that exists elsewhere under the binary's folder is reported with its path.
- Reads the PE file directly, so no Visual Studio or `dumpbin` is needed.
