# Code review regression checks

The five findings from the October 2026 review are covered by targeted regressions.

| Original finding | Fix | Regression coverage |
| --- | --- | --- |
| Navigation GET bypasses CSRF | POST with `X-Playlet`; GET returns 405 without UI effects | Browser API test, ViewRouter Rooibos test, HTTP and UI navigation checks |
| Storage failure discards successful responses | Disabled cache skips reads and writes; cache operations catch failures | Browser tests for quota, inaccessible storage, corrupt/expired entries, valid hits and clearing |
| State endpoint blocks server | Return available state immediately; retain asynchronous lookup | Rooibos unavailable/resolved version test and concurrent HTTP reads |
| Active connection limit unenforced | Close newly accepted sockets at capacity; honor response connection-close headers so browser slots are released | Rooibos admission/response-close tests and real socket capacity, existing-client, 25 browser-style requests and timeout recovery checks |
| Completed oversized requests bypass limit | Check received bytes before parsing/dispatch; reject oversized declarations early with 413 and close | Rooibos and real socket boundary, final-chunk, fragmented-body/header and huge declaration checks |

`MaxRequestLength` counts the full request in bytes, including headers and body. A request exactly at the limit remains valid. The navigation method change intentionally requires external API callers to switch from GET to POST and send `X-Playlet`.

## Running the checks

- `npm run test:web`: browser API regressions, no device required. Uses the installed TypeScript compiler and Node test runner; tests both current disabled-cache and enabled-cache builds.
- `npm run lint`, `npm run build:web`, `npm run test:build`: local validation and test packages.
- `npm test`: runs browser regressions, then installs and runs both Rooibos suites on the configured Roku. This replaces its sideloaded development channel.
- Build the regular app, then `node tools/deploy-dev-app.js`: install the updated package in the development slot without clearing registry data.
- `npm run test:http`: real HTTP regressions against the running updated app. Run separately from other device tests; its connection-cap test intentionally fills all ten slots and waits for the 30-second idle timeout.
- Run the player integration specs and `integration-tests/navigation-smoke.ts` on a development build with `USE_DEV_PLAYER=true`. The navigation smoke checks actual screen changes, mix continuation, picture-in-picture, search, queueing, web resources and preference preservation.

Browser regressions also run in the pull-request workflow; Rooibos suites run in the release workflow.

The existing integration specs can use the installed ts-node without downloading tsx:

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"Node","ignoreDeprecations":"6.0","rootDir":"."}' \
  node -r ts-node/register/transpile-only integration-tests/navigation-smoke.ts
```

Use the same command with `vpd-player-transport.ts`, `vpd-player-buttonrow.ts`, `vpd-player-bif.ts`, `vpd-player-adversarial.ts`, `vpd-player-live.ts` and `vpd-player-sbskip.ts`. Live playback can be skipped by the existing suite when no stream is available; a skip is not verification.

## Test fixture corrections

The player integration harness had an outdated two-button mapping. It now matches the existing three-button implementation (`playPause=0`, `menu=1`, `minimize=2`) and checks navigation through all three buttons. Launch verification waits up to 15 seconds for the app to become active; playback readiness assertions remain unchanged.

## Verification results

Final validation on 2026-10-18:

- All five original findings fixed and checked again against the final implementation; no failures remained in their regressions.
- 792 library and 23 loader unit tests passed on the configured Roku, with zero failures or crashes.
- Seven browser API tests passed. Running the same tests against the original sources produced four expected failures, confirming they detect the cache/navigation defects.
- Nine HTTP regression groups passed against a production-mode package installed in the development slot, including request limits, CSRF protection, 25 browser-style keep-alive requests, capacity enforcement and timeout recovery.
- All six player integration suites passed on the final development package: transport, button row, previews, adversarial input, live playback and SponsorBlock. Live playback ran successfully rather than being skipped.
- The final UI smoke test passed: web resources/settings, search, queue addition, rejected GET without UI changes, channel/playlist/mix navigation, mix continuation, picture-in-picture, continuing playback and preference preservation. Queue verification waits for the asynchronous render-thread update and reads the existing lowercase `videoid` wire field.
- Repository lint, touched BrightScript formatting, web build, test-package builds, and production/development app and library builds passed. The updated development app remains installed.

The browser smoke exposed an additional socket bookkeeping defect: responses advertised `Connection: close` but left requested keep-alive sockets open. The server now honors the response header; both unit and HTTP tests cover this interaction with the new connection cap.

Local reports and logs are saved under `build/review-verification/`, including a machine-readable `summary.json`. Checks ran with local Node 26.8.1 and one configured Roku; the Node 22 GitHub workflows have been updated but were not executed here. This records observed coverage, not a guarantee for every device or external-service condition.
