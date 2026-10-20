---
name: playlet-device
description: Build, sideload, test and drive the Playlet fork on the user's Roku with the roku-mcp tools. Use before any on-device work in this repo.
---

# Playlet on the device

Device host and dev password are in the repo-root `.env` (`ROKU_DEV_TARGET` / `ROKU_DEVPASSWORD`, gitignored). roku-mcp reads them as aliases. Never print them; refer to them as `<roku>`.

## Node

The machine's Node is too new for the repo (engine-strict, Node 22). Run npm through `npx -y -p node@22 -- npm ...`.

## Build and sideload

1. `npx -y -p node@22 -- npm run build:dev` (repo root) → `dist/playlet-app.zip`.
2. `roku_deploy zipPath=<abs repo>/dist/playlet-app.zip`. Not `rootDir`: the app builds its own package. Never `deleteInstalledChannel=true` or `roku_delete_dev_channel`: deleting the dev channel wipes its registry (the user's login and settings). If it happens anyway, restore the newest backup (see below).
3. The debug app loads the lib from `http://<mac-ip>:8086` when `dist/` is served (`cd dist && python3 -m http.server 8086`, in the background). Otherwise it falls back to the embedded lib.
4. `roku_sleep` 3000–5000 ms before driving the UI.

## Unit tests (they wipe the registry)

`npm run test` in `playlet-lib` or `playlet-app` deploys a test package over the dev channel and shares its registry: logins and profiles are lost.

1. Before, with the app running: `node tools/registry.js --output ~/Documents/playlet_fork-backups/registry-<date>.json`, then `chmod 600` the file.
2. Stop any console capture on 8085 (it and the test runner kick each other off).
3. Run the tests.
4. After: rebuild + redeploy the app, launch it, `node tools/registry.js --input <backup>`, then relaunch (the running app keeps its old in-memory state).

Never `npm run registry:read`: it writes login tokens to `registry.json` in the repo root, which is not gitignored.

## Drive the UI

- Check `roku_get_focused_node` before every Select. In a Home row, Left moves within the row; the nav bar is only reached from the first cell. The nav items are indexed 0 Profile, 1 Search, 2 Home, … (the `index` of the focused NavBarComponent).
- The search box's raw text (with ZWNJ etc.) is readable from `query/app-ui`: the first `text=` inside `VoiceTextEditBox`.

- Play a video directly: `roku_launch appId=dev params={contentId:<id>, mediaType:movie}`. Test ids: `0e3GPea1Tyg` (many dubbed audio tracks), `PumAZQeVVJo` (Persian, single language + Stable Volume).
- The nav bar is on the left; enter a page with Right.
- Player menu: the ⋮ button (Up, Up, Right, OK). Not `*`: Roku OS takes it during fullscreen video.
- Search keyboard: focus starts on backspace in the top row. The 🌐 key switches language (Persian is at the bottom of the dialog).
- Player chrome hides after ~5 s and a screenshot takes ~8 s: send whole key sequences, then screenshot. SponsorBlock skip notices capture OK/Back.
- Screenshot before Select when focus is uncertain: a blind sequence once changed the device-wide caption mode.

## Backend checks

While the app runs, its web server answers on `<roku>:8888`:

- `curl http://<roku>:8888/playlet-invidious-backend/api/v1/...` (e.g. `search`, `channels/{ucid}/videos`). Curl the backend before blaming the layout.
- Debug registry: `http://<roku>:8888/debug/registry`.

## Images and lint

- `npx -y -p node@22 -- npm run convert-images` converts new/changed SVGs. Never `--force` (it rewrites every PNG).
- Persian keyboard key icons: `npx -y -p node@22 -- npm run generate-persian-kb-icons`.
- Lint: `cd playlet-lib && npx -y -p node@22 -- npx bslint --project bsconfig.lint.json --lintConfig ../config/bslint.jsonc`.

## Diagnosis order

1. Console log (port 8085): backtraces, `Missing or invalid PHY` (missing OS artwork: bundle an image). Dead keys plus a hanging RTA query mean the app is stopped in the debugger.
2. `roku_get_focused_node`, or RTA `getFocusedNode` with `includeKeyPath`.
3. Curl the backend.
4. Temporary `LogDebug` lines, then redeploy.

Generic SceneGraph/BrighterScript pitfalls (`roFontRegistry` on the render thread, RowList item parents, SetFocus no-ops, namespace shadowing, Persian shaping) are in the roku-mcp `scenegraph-pitfalls` skill.
