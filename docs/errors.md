# Errors

Rushline has three places where a failure reaches someone: the telemetry endpoint, the browser's uploader, and the career save. Read this file before you add or change one of them. [coding-standards.md](coding-standards.md) explains the Rule | Check | Scope | Exemption tables, and `pnpm check:rules` checks every Check cell here.

## The telemetry endpoint

`POST /api/telemetry` (`apps/web/src/routes/api/telemetry.ts`) runs `collect` from `apps/web/src/server/telemetry.ts` with `Effect.runPromise`, and is the only server code that runs an Effect. It passes the store Layer that `vite.config.ts` installed through `apps/web/src/server/telemetry-local.ts`. With no Layer installed, `collect` refuses with `NoStore` before it reads the request. With one, `ingest` reads the body, decodes the batch, takes `receivedAt` from Effect's `Clock` and saves through the `TelemetryStore` service. Each refusal is a `Schema.TaggedError` in `apps/web/src/server/refusals/`, and `statusOf` maps each tag to one HTTP status.

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
| The route provides the store Layer and is the only server code that runs an Effect. `collect`, `ingest`, the refusals and the store Layers return Effects. | `rushline/no-effect-runtime`, judgment | `apps/web/src/routes/api/telemetry.ts`, `apps/web/src/server`, `packages/telemetry/src` | None |
| A batch the store has already saved is acknowledged with `duplicate: true`, not refused, so a retried upload is safe. | `pnpm test` | `apps/web/src/server/telemetry.ts`, `packages/telemetry/src/jsonl-store.ts`, `packages/telemetry/src/memory-store.ts` | None |

## The uploader

`apps/web/src/diagnostics/uploader.ts` keeps the queue, the report status and the beacon in plain TypeScript. The first time a batch may leave, `hub.ts` loads `uploader-runtime.ts` with a dynamic import, and that entry runs the delivery loop in `apps/web/src/diagnostics/upload/` with `Effect.runForkWith`.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A 400 or 413 answer is final: the batch leaves the queue and a report shows `failed`. Any other failed status, an unreachable collector, or a success answer that is not a decoded acknowledgement of the batch keeps the batch and retries it. | `pnpm test` | `apps/web/src/diagnostics/uploader.ts`, `apps/web/src/diagnostics/upload` | None |
| Only a decoded acknowledgement whose `sessionId` and `batchId` match the sent batch removes it from the queue, whether `duplicate` is true or false. The collector answers `duplicate: true` only when it already holds that batch. | `pnpm test` | `apps/web/src/diagnostics/upload/delivery.ts` | None |
| A retry waits on an Effect Schedule: 4 seconds after the first failure, then 8, 16 and 32, and 60 after every later one. One delivery loop runs at a time, and a drain while it sends or waits neither starts another nor cuts the wait short. | `pnpm test` | `apps/web/src/diagnostics/upload/worker.ts`, `apps/web/src/diagnostics/uploader-runtime.ts` | None |

## The career save

`parseCareer` (`packages/career/src/save.ts`) decodes the text with Effect Schema: first a JSON object, then its `version`, then `EncodedSaveSchema` with every failure collected, then the plain checks in `save-invariants.ts`. `save-issues.ts` turns the collected failures into the one field the version 2 reader reported, so the title's corrupt panel names the same field. `pnpm check:save-format` keeps the encoded save tied to `SAVE_VERSION` ([coding-standards.md](coding-standards.md)).

The browser save, `apps/web/src/career/save.ts`, runs each storage step with `Effect.runSync` and returns a typed outcome to `use-flow.ts`. `save-storage.ts` turns a `localStorage` call that throws into a `SaveStorageFailed` (`save-storage-error.ts`) that names the step, `acquire`, `read`, `write`, `backup` or `remove`, and keeps the browser's error as its `cause`.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `parseCareer` never throws. It returns `{ ok: false, error }` with a `kind` of `notJson`, `wrongVersion`, `invalid` or `inconsistent` and the `field` that failed, and a save from another version is refused rather than migrated. | `pnpm test` | `packages/career/src/save.ts`, `packages/career/src/save-*.ts` | None |
| A save with several faults is refused at one field, in the version 2 reader's order: the version; then `weapon`, the `qualified`, `season` and `memory` containers, `garage` and `bikeId`; then the other fields in key order, with `activeRace.started` first and an unknown road or racer key before the known ones; then `weaponHits` against the weapon held; then the contradictions. An unknown road or racer key is refused by name, and any other unknown field is dropped. | `pnpm test` | `packages/career/src/save-issues.ts`, `packages/career/src/save-schema.ts`, `packages/career/src/save-invariants.ts` | None |
| The browser save keeps four outcomes apart: no save, storage the browser denies (`unavailable`), a failed read (`readFailed`) and a failed write (`writeFailed`), each with the original failure as its `cause`. A race left by a reload is charged once, and a failed save of that charge stays `writeFailed`, never `saved`. | `pnpm test` | `apps/web/src/career/save*.ts`, `apps/web/src/components/use-flow.ts` | None |
| Starting over reads the save, copies its exact text to `rushline.career.backup`, then removes it, and clears the career only after the removal succeeds. A failed read, backup or removal leaves the save in place. Every career change is written, even after the first read failed, so a new career can overwrite a save that could not be read; that unread text has no backup, because it could not be read. The unsaved banner shows only when the write itself fails. | `pnpm test` | `apps/web/src/career/save*.ts`, `apps/web/src/components/use-flow.ts` | None |
