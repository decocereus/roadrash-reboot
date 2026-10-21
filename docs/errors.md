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

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `parseCareer` never throws. It returns `{ ok: false, error }` with a `kind` of `notJson`, `wrongVersion`, `invalid` or `inconsistent` and the `field` that failed, and a save from another version is refused rather than migrated. | `pnpm test` | `packages/career/src/save.ts`, `packages/career/src/save-schema.ts`, `packages/career/src/save-invariants.ts` | None |
