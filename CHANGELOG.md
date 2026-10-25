# Changelog

All notable changes to SideScroller. Newest first.

## 2026-10-25

### Changed
- **LLM bot brains now default to UltimateController (uC) at
  `http://192.168.15.3:11434/v1/chat/completions`** (`server/llmbrain.js`, `LLM_URL`).
  The old default was Golden Eye `192.168.15.3:21345`. The model is still `qwen3:4b`.
  - Why: Golden Eye is retired. uC routes by model name, so the old "different port for the
    14B" option is gone, and uC has no `qwen2.5:14b-instruct`. The header comment now
    names `qwen3.8-flash-next-iq3_s` as the smarter option, selected with `SS_LLM_MODEL`.
  - Verified: `node --check`, plus a real request using the module's own `LLM_URL` and
    `LLM_MODEL`. It returned HTTP 200 and a parseable `{"goal": ...}` plan.
  - Undo: `git revert` the commit, or set `SS_LLM_URL`.

## 2026-08-13

### Added
- `start-server.sh` — Linux/macOS launcher, the counterpart to the existing
  `start-server.bat`. Checks for Node 18+ (the LLM bot brains use global
  `fetch`), makes sure the one runtime dependency (`ws`) is installed, then
  `exec`s the server so Ctrl+C reaches Node directly and the world still saves
  on SIGINT. Options: `--port`, `--data`, `--llm-url`, `--llm-model`,
  `--skip-install`, `--help`; the matching `PORT` / `SS_DATA` / `SS_LLM_URL` /
  `SS_LLM_MODEL` environment variables keep working.

  Dependency install has three tiers, because **MOBILE has no npm** — Debian 13
  ships `nodejs` without it. In order: `npm` if present, else `corepack npm@10`
  (corepack *is* in the Debian package; the version is pinned because bare
  `corepack npm` pulls npm 12, which warns it does not support Node 20), else a
  direct install from `package-lock.json` — each production entry's tarball
  fetched with curl and checked against the lockfile's sha512 before extraction,
  refusing to install on a mismatch. `ws` has no dependencies of its own, so
  that last tier is a complete install rather than a workaround.

  There is no Python in this project and therefore no virtualenv; the script
  says so in its header so the next person does not go looking for one.

- `CHANGELOG.md` (this file).

### Changed
- `.claude/launch.json` — the `game` config now runs `./start-server.sh` instead
  of `node server/index.js` directly, so the preview pane exercises the same
  launch path a human uses, dependency check included.
- `README.md` — documents the Linux/macOS launcher and states plainly that the
  only requirements are Node.js 18+ and `ws`.

### Verified
- All three install tiers exercised on a dependency-free copy of the tree:
  corepack (`added 1 package in 437ms`) and the lockfile fallback both produced
  a server that booted and served `/` with HTTP 200; a deliberately corrupted
  lockfile hash aborted the install with nothing written to `node_modules/`.
- Ctrl+C path checked: `exec` means the tracked PID is Node itself, SIGINT logs
  `saving world...` and writes `save.json` before exit.
- Booted through the preview pane against the real save — title screen renders,
  no console errors. Not clicked past "Wash ashore", which would have added a
  survivor profile to the live world.
