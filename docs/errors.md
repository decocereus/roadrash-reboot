# Errors

Rushline has three places where a failure reaches someone: the telemetry endpoint, the browser's uploader, and the career save. Read this file before you add or change one of them. [coding-standards.md](coding-standards.md) explains the Rule | Check | Scope | Exemption tables, and `pnpm check:rules` checks every Check cell here.

## The telemetry endpoint

`POST /api/telemetry` (`apps/web/src/routes/api/telemetry.ts`) hands the request to `ingestTelemetry` in `apps/web/src/server/telemetry.ts`. A refusal is a tagged value, and `statusOf` maps each tag to one HTTP status.

| Tag | Status | Meaning |
| --- | --- | --- |
| `TooLarge` | 413 | The declared or actual body is over `MAX_REQUEST_BYTES`. Carries `bytes`. |
| `NotJson` | 400 | The body could not be read or is not JSON. |
| `Invalid` | 400 | The JSON does not match the batch schema. Carries `issue`, the schema's message cut to 600 characters. |
| `NoStore` | 503 | No store was injected, as in the deployed Worker today. |
| `StoreFailed` | 500 | The store's `save` rejected. Carries `issue`, the error cut to 600 characters. |

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Every refusal tag has exactly one status. `statusOf` is typed with `satisfies Record<Refusal["_tag"], number>`, so a new tag fails the typecheck until it gets one. | `pnpm typecheck` | `apps/web/src/server/telemetry.ts` | None |
| A failure at a boundary, reading the body or saving the batch, is caught with `Effect.tryPromise` and mapped to a tag. `ingestTelemetry` always answers with a JSON body and never throws. | judgment | `apps/web/src/server/telemetry.ts` | None |
| A refusal body carries only its tag and the facts in the table above, and free text is cut to 600 characters. | judgment | `apps/web/src/server/telemetry.ts` | None |
| A batch the store has already saved is acknowledged with `duplicate: true`, not refused, so a retried upload is safe. | `pnpm test` | `apps/web/src/server/telemetry.ts`, `tools/perf/jsonl-store.ts` | None |

## The uploader

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A 400 or 413 answer is final: the batch leaves the queue and a report shows `failed`. Any other failed status, or an unreachable collector, keeps the batch and retries it: the first retry waits 4 seconds, the next ones 8, 16 and 32, and every later one 60. | judgment | `apps/web/src/diagnostics/uploader.ts` | None |

## The career save

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `parseCareer` never throws. It returns `{ ok: false, error }` with a `kind` of `notJson`, `wrongVersion`, `invalid` or `inconsistent` and the `field` that failed, and a save from another version is refused rather than migrated. | `pnpm test` | `packages/career/src/save.ts` | None |
