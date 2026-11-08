# Errors

Rushline has five places where a failure reaches someone: the telemetry endpoint, the browser's uploader, the career save, the game's asset loading, and the art route. Read this file before you add or change one of them. [coding-standards.md](coding-standards.md) explains the Rule | Check | Scope | Exemption tables, and `pnpm check:rules` checks every Check cell here.

## The telemetry endpoint

`POST /api/telemetry` (`apps/web/src/routes/api/telemetry.ts`) runs `collect` from `apps/web/src/server/telemetry.ts` with `Effect.runPromise`. It, the player events route and the art route are the only server code that runs an Effect. It passes the store Layer that `vite.config.ts` installed through `apps/web/src/server/telemetry-local.ts`. With no Layer installed, `collect` refuses with `NoStore` before it reads the request. With one, `ingest` reads the body, decodes the batch, takes `receivedAt` from Effect's `Clock` and saves through the `TelemetryStore` service. Each refusal is a `Schema.TaggedError` in `apps/web/src/server/refusals/`, and `statusOf` maps each tag to one HTTP status.

| Tag | Status | Meaning |
| --- | --- | --- |
| `TooLarge` | 413 | The declared or actual body is over `MAX_REQUEST_BYTES`. Carries `bytes`. |
| `NotJson` | 400 | The body could not be read or is not JSON. |
| `Invalid` | 400 | The JSON does not match the batch schema. Carries `issue`, always `Invalid telemetry batch.` |
| `NoStore` | 503 | No store Layer was installed, as in the deployed Worker today. |
| `StoreFailed` | 500 | The store could not read, decode or append the session's file. Carries `issue`, always `Telemetry storage failed.` The route logs the store's error on the server console. |

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Every refusal tag has exactly one status. `statusOf` is typed with `satisfies Record<Refusal["_tag"], number>`, so a new tag fails the typecheck until it gets one. | `pnpm typecheck` | `apps/web/src/server/telemetry.ts` | None |
| A refusal is built with its `Schema.TaggedError` constructor and keeps the failure behind it, the body read, the JSON parse, the schema error or the store error, as its `cause`. | `rushline/no-manual-tagged-construction`, `rushline/require-wrapped-cause` | `apps/web/src/server` | None |
| A refusal body carries only its tag, the facts in the table above and a fixed `issue`. Both `issue` texts live in one object in `telemetry.ts`. No cause, stack, path or schema message reaches the response. | `pnpm test` | `apps/web/src/server/telemetry.ts` | None |
| The route provides the store Layer, and it, `POST /api/events` and `GET /art/<key>` are the only server code that runs an Effect. `collect`, `ingest`, the refusals and the store Layers return Effects. | `rushline/no-effect-runtime`, judgment | `apps/web/src/routes/api/telemetry.ts`, `apps/web/src/server`, `packages/telemetry/src` | None |
| A batch the store has already saved is acknowledged with `duplicate: true`, not refused, so a retried upload is safe. | `pnpm test` | `apps/web/src/server/telemetry.ts`, `packages/telemetry/src/jsonl-store.ts`, `packages/telemetry/src/memory-store.ts` | None |

## The uploader

`apps/web/src/diagnostics/uploader.ts` keeps the queue, the report status and the beacon in plain TypeScript. The first time a batch may leave, `hub.ts` loads `uploader-runtime.ts` with a dynamic import, and that entry runs the delivery loop in `apps/web/src/diagnostics/upload/` with `Effect.runForkWith`.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A 400 or 413 answer is final: the batch leaves the queue and a report shows `failed`. Any other failed status, an unreachable collector, or a success answer that is not a decoded acknowledgement of the batch keeps the batch and retries it. | `pnpm test` | `apps/web/src/diagnostics/uploader.ts`, `apps/web/src/diagnostics/upload` | None |
| Only a decoded acknowledgement whose `sessionId` and `batchId` match the sent batch removes it from the queue, whether `duplicate` is true or false. The collector answers `duplicate: true` only when it already holds that batch. | `pnpm test` | `apps/web/src/diagnostics/upload/delivery.ts` | None |
| A retry waits on an Effect Schedule: 4 seconds after the first failure, then 8, 16 and 32, and 60 after every later one. One delivery loop runs at a time, and a drain while it sends or waits neither starts another nor cuts the wait short. | `pnpm test` | `apps/web/src/diagnostics/upload/worker.ts`, `apps/web/src/diagnostics/uploader-runtime.ts` | None |

## The career save

`parseCareer` (`packages/career/src/save.ts`) decodes the text with Effect Schema: first a JSON object, then its `version`, then `EncodedSaveSchema` with every failure collected, then the plain checks in `save-invariants.ts`. `save-issues.ts` turns the collected failures into the one field the version 2 reader reported, so the title's corrupt panel names the same field. `pnpm check:save-format` keeps the encoded save tied to `SAVE_VERSION` ([standards/simulation.md](standards/simulation.md)).

The browser save, `apps/web/src/career/save.ts`, runs each storage step with `Effect.runSync` and returns a typed outcome to `use-flow.ts`. `save-storage.ts` turns a `localStorage` call that throws into a `SaveStorageFailed` (`save-storage-error.ts`) that names the step, `lock`, `acquire`, `read`, `write`, `backup` or `remove`, and keeps the browser's error as its `cause`.

One tab holds the career. `holdCareer` in `save.ts` is the career a tab holds, and `useSave` in `use-flow.ts` only wires it to React. Before the save is read, it asks `navigator.locks` for the exclusive `rushline.career` lock through `Effect.runFork`. It waits up to 2 seconds, so a reload of the tab that holds the career gets it back while the old page lets go. Once it holds the lock and the race rules have loaded it reads the save, and it writes each career change and each start-over only while it still holds the lock. A tab still without the lock after that wait is `elsewhere`: it never reads, resumes or writes the save, and it shows that the career is open in another tab, with Try again, which reloads. It stops waiting, so when the holding tab closes nothing moves on its own: the next tab to open or try again takes the career. The page lets go at `pagehide`, because a page kept in the back/forward cache would otherwise hold the lock. It stops holding the career before it releases the lock, so from then on the page shows `elsewhere` and refuses every read, write and start-over, including those from work it queued earlier. A page the browser brings back from that cache reloads to ask again, and until the reload lands it cannot overwrite the tab that holds the career now. A lock request the browser refuses is the `lock` step, and the tab then gets storage that refuses every step as `unavailable`, as when the browser denies storage. A room link still seats its rider in a tab that does not hold the career, because a room race never touches the career.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `parseCareer` never throws. It returns `{ ok: false, error }` with a `kind` of `notJson`, `wrongVersion`, `invalid` or `inconsistent` and the `field` that failed, and a save from another version is refused rather than migrated. | `pnpm test` | `packages/career/src/save.ts`, `packages/career/src/save-*.ts` | None |
| A save with several faults is refused at one field, in the version 2 reader's order: the version; then `weapon`, the `qualified`, `season` and `memory` containers, `garage` and `bikeId`; then the other fields in key order, with `activeRace.started` first and an unknown road or racer key before the known ones; then `weaponHits` against the weapon held; then the contradictions. An unknown road or racer key is refused by name, and any other unknown field is dropped. | `pnpm test` | `packages/career/src/save-issues.ts`, `packages/career/src/save-schema.ts`, `packages/career/src/save-invariants.ts` | None |
| One tab holds the career. `holdCareer` takes the exclusive lock before the save is read and keeps it until the page hides. A tab that finds it held never loads, resumes or writes the save, so a race the holding tab is riding is never charged as left. A page that let go of the lock writes nothing more, even from work it queued before, so a page restored from the back/forward cache cannot overwrite the tab that holds the career now. | `pnpm test` | `apps/web/src/career/save*.ts`, `apps/web/src/components/use-flow.ts` | None |
| The browser save keeps four outcomes apart: no save, storage the browser denies (`unavailable`), a failed read (`readFailed`) and a failed write (`writeFailed`), each with the original failure as its `cause`. A race left by a reload is charged once, and a failed save of that charge stays `writeFailed`, never `saved`, and `saveStateOf` marks that career `unsaved`. | `pnpm test` | `apps/web/src/career/save*.ts`, `apps/web/src/components/use-flow.ts` | None |
| Starting over reads the save, copies its exact text to `rushline.career.backup`, then removes it, and clears the career only after the removal succeeds. A failed read, backup or removal leaves the save in place. Every career change is written, even after the first read failed, so a new career can overwrite a save that could not be read; that unread text has no backup, because it could not be read. The unsaved banner shows only when the write itself fails, during a load or a later change. It reads `unsaved` from the `ready` save state, so a career that is gone cannot keep it. | `pnpm test` | `apps/web/src/career/save*.ts`, `apps/web/src/components/use-flow.ts` | None |

## Race rules

The server serves the race rules at `GET /api/race-rules` from `apps/web/src/server/race-rules.ts`, as JSON with `cache-control: no-store`. The browser asks once at boot. `loadRaceRules` in `apps/web/src/rules/load.ts` forks the request with `Effect.runFork`, decodes the answer with `RaceRulesSchema`, and hands `use-flow.ts` a ready rules record or a failure. Unmounting interrupts the request. The request has one deadline of 10 seconds, `RULES_DEADLINE_MS`, over the answer and its body together, so a server that never answers or never finishes the body fails the load instead of leaving the player on the boot screen, and the request is aborted. The loader never retries. The career save waits for the rules, and a failure sends the player to the Back Room, which shows "Could not start the game:" and the message, with Try again as its only action. Try again reloads the page, which asks for the rules again.

| Tag | What the player sees |
| --- | --- |
| `RulesRequestFailed` | The fetch or the body read failed. The Back Room shows the browser's message. |
| `RulesTimedOut` | The answer and its body took more than 10 seconds. The Back Room shows `Getting the race ready took too long. Try again.` |
| `RulesResponseRejected` | The Back Room shows `The race rules answered <status>.` |
| `RulesDecodeFailed` | The answer was not JSON or broke the schema, such as a field above 15 racers. The Back Room shows `The race rules did not decode.` |

A save whose tier is above the top tier is refused as `invalid` at `tier`, so the Back Room's corrupt panel names that field.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| The route serves rules that `RaceRulesSchema` accepts, uncached. Each load failure is a `Schema.TaggedError` built with its constructor, and a thrown failure keeps what was thrown as its `cause`. | `pnpm test`, `rushline/no-manual-tagged-construction`, `rushline/require-wrapped-cause` | `apps/web/test/race-rules.test.ts`, `apps/web/src/rules` | None |

## Asset loading

`bootGame` in `apps/web/src/asset-load.ts` starts the game chunk and `apps/web/src/asset-runtime.ts` together. The runtime runs `loadAssets` from `apps/web/src/assets/load.ts` with `Effect.runForkWith` and the mount's `AbortSignal`, and it is the only browser code besides the uploader, the race rules and the career lock that forks an Effect. It downloads the nine boot models, parses each with the game's parser once the game chunk has arrived, and waits for the display font. A celebrity rider is not among them: the game's wardrobe asks the same runtime for each celebrity a race wears, through `loadCelebrity`, while it prepares that race. The bridge turns the outcome into a promise: the game, `null` when the mount ended first, or a rejection. The Back Room and the ride-out card show its message after "Could not start the game:". In a race room the same line replaces the lobby, with Reload and Leave, and the rider holds no seat, so no race waits for a game that cannot load it. A seat that was already open closes with `SEAT_LEFT` (4410), as Leave does, so the others see the spot free at once instead of an away rider.

| Tag | Retried | What the player sees |
| --- | --- | --- |
| `ModelRequestFailed` | Once | The fetch or the body read failed. The title shows the browser's message. |
| `ModelResponseRejected` | Once for a 5xx answer, never for a 4xx | The title shows `The model <url> answered <status>.` |
| `ModelDecodeFailed` | Never | The parser rejected the bytes. The title shows the parser's message, such as `The rider model <url> has no poses.` |
| `FontReadinessFailed` | Never | Nothing. The game starts with the fonts the page has, and the bridge records the message as a recorder fault from `fonts`, which keeps it only while a race is recording. |

Only a completed download enters the page's byte cache, keyed by the model's fingerprinted URL. A failed download or a rejected answer caches nothing, so the next mount fetches that model again. The bytes enter the cache before they are parsed, so a parse failure keeps them but no decoded model, and a later mount parses them again without fetching. Decoded models belong to one mount. They are released once, when the game is disposed, when the mount is aborted, or when another model of the same mount fails; a parse that finishes after the mount ended is released as it arrives. A remount parses the cached bytes again.

A celebrity's download and parse follow the same rules and retries, keyed by its own URL. The wardrobe holds each decoded celebrity until a race is built without it or the game is disposed, and releases it once. A celebrity that fails to load fails the race's preparation with the stage `dress`: the race on screen stays as it was, the recorder keeps the message as a fault from `prepare dress`, and RideOut says the riders did not load and offers Retry and Back instead of moving to the race screen. Retry prepares the race again, which fetches the model again because a failed download cached nothing. A failed `build` stage takes the same path, since it also leaves no race to start. In a race room neither stage reports the seat as loaded: the rider leaves the seat, so the others' countdown does not wait for them, and returns to the same room's lobby for the next race. `preparedRace` in `apps/web/src/prepare-outcome.ts` decides which outcomes leave a race for both paths, and the transition tables in `apps/web/src/race-handoff.ts` decide what each path does next.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Only a completed download enters the byte cache. A failed download or answer caches nothing, so the next mount fetches again. A parse failure keeps the completed bytes but no decoded model, so a later mount parses them again without fetching. Decoded models belong to one mount and are released once when it ends. | `pnpm test` | `apps/web/test/asset-load.test.ts` | None |
| A race loads only the celebrities its riders wear, once each, and a plain race loads none. The next race with the same rider fetches and parses nothing. The wardrobe releases a celebrity once when a race is built without it, and every celebrity it holds once when the game is disposed. A failed celebrity load fails the race's dressing and the next race fetches it again. | `pnpm test` | `apps/web/test/celebrity-load.test.ts` | None |
| A race that was not built never reports a room's seat as loaded: the seat leaves and moves back to the room. On the ride-out card it offers Retry and Back and starts nothing. An outcome that arrives after the card closed starts nothing. | `pnpm test` | `apps/web/src/race-handoff.ts`, `apps/web/test/race-handoff.test.ts` | None |
| A game that failed to boot holds no seat in a race room. The room shows "Could not start the game:" with the message, Reload and Leave, in place of the lobby, and a seat that was open closes with `SEAT_LEFT`. | `pnpm test` | `apps/web/src/components/room-lobby.tsx`, `apps/web/src/room-handoff.ts`, `apps/web/test/room-boot-failure.test.tsx`, `apps/web/test/race-handoff.test.ts` | None |
| Only a transport or body-read failure or a 5xx answer is retried, once, through `Effect.retry`. A 4xx answer, a parser rejection, a font failure and an interruption are not retried. | `pnpm test` | `apps/web/test/asset-load.test.ts` | None |
| Each asset failure is a `Schema.TaggedError` built with its constructor, and a thrown failure keeps what was thrown as its `cause`. A rejected HTTP status has nothing thrown to keep. | `rushline/no-manual-tagged-construction`, `rushline/require-wrapped-cause` | `apps/web/src/assets` | None |

## Game art

`GET /art/<key>` (`apps/web/src/routes/art/$key.ts`) runs `serveArt` from `apps/web/src/server/art.ts` with `Effect.runPromise`, against the Worker's `ART` R2 binding. A stored key answers 200 with the object's content type, its ETag and `cache-control: public, max-age=31536000, immutable`. A key the bucket lacks answers 404 with `cache-control: no-store`, so a key uploaded later is not hidden by a cached miss. A bucket read that throws becomes `ArtReadFailed`, which the route logs with its cause and answers 502, uncached. The game meets either failure as a rejected model or a broken menu image, and asset loading above handles the model.

In dev and preview the middleware in `apps/web/vite.config.ts` answers instead. A path that is not a content-addressed key answers 404. A key the shared cache lacks is downloaded from the deployed Worker; an unreachable origin, a non-200 answer or bytes that do not hash to the key answer 502 with the reason, and nothing is cached. The art tools fail with `ArtRejected` (`tools/art/src/art-rejected.ts`) and the same reasons, and `pnpm art:upload` refuses a manifest key that is not in this machine's cache, naming the machine that must stage it.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A miss and a read failure are answered uncached; only a stored object carries the immutable header. Bytes enter the local cache only when they hash to their key. | judgment, `pnpm test` | `apps/web/src/server/art.ts`, `apps/web/vite.config.ts`, `tools/art` | None |

## Shader preparation

`prepare` in `apps/web/src/game/game.ts` dresses and builds a race, and `createPreparation` in `apps/web/src/game/preparation.ts` compiles and warms its shaders. Each turns a failure into a typed outcome instead of a rejection, and `preparedRace` in `apps/web/src/prepare-outcome.ts` sorts every outcome into a race that was built or one that was not. A built race starts, and the player sees nothing new. A `dress` or `build` failure leaves no race to start, so the ride-out card offers Retry and Back, and in a race room the seat leaves the race, as [Asset loading](#asset-loading) describes.

| Outcome | When | What happens |
| --- | --- | --- |
| `ready` | Every program compiled. | The game warms up and draws the start grid. |
| `timedOut` | The compile was still pending after five seconds. | The game warms up anyway, so the first frame may stall. |
| `failed`, stage `dress` | A celebrity rider the race wears did not load. | The game records a recorder fault from `prepare dress` with the error's message. No race is built: the ride-out card offers Retry and Back, and a room seat leaves the race. |
| `failed`, stage `build` | Building the race threw. | The game records a recorder fault from `prepare build` with the error's message. No race is built, as for `dress`. |
| `failed`, stage `compile` | `compile` threw. | The game warms up anyway and records a fault from `prepare compile`. |
| `failed`, stage `warm` | The warm-up draw threw. | Staging is put back and the game records a fault from `prepare warm`. |
| `lost` | The WebGL context was lost before or during the compile. | Nothing warms while the context is lost. The race stays as it is. |
| `cancelled` | A newer preparation or the unmount replaced this one. | Nothing. The newer preparation decides. |

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A thrown dress, build, compile or warm-up becomes a `failed` outcome that keeps the thrown error as its `cause` and names its stage, and the game records it as a recorder fault from `prepare <stage>`. No preparation rejects. Only a `dress` or `build` failure changes what the pre-race screen shows, because it leaves no race to start. | `pnpm test` | `apps/web/src/game/preparation.ts`, `apps/web/src/prepare-outcome.ts`, `apps/web/test/preparation.test.ts`, `apps/web/test/prepare-outcome.test.ts` | None |
