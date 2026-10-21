# Observability

Rushline records two things: play-test telemetry from testers' browsers, and frame profiles for performance work. Read this file before you add a recorded number, a profile counter or a log line. [coding-standards.md](coding-standards.md) explains the Rule | Check | Scope | Exemption tables, and `pnpm check:rules` checks every Check cell here.

## Play-test telemetry

`apps/web/src/diagnostics` holds the hub, the recorder, the uploader and the device-local settings under `rushline.settings.v1`. `packages/telemetry` holds the wire contract. The collector is `POST /api/telemetry`; [errors.md](errors.md) lists its refusals.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Nothing is uploaded without the tester's choice. Automatic upload is off by default. Until the tester turns it on, batches wait in the page's queue and leave only when the tester sends a report. | judgment | `apps/web/src/diagnostics` | None |
| The hub owns the session: a UUID per page load, the build's commit and dirty flag stamped by `vite.config.ts`, and the device the tester picked. Every batch carries it. | judgment | `apps/web/src/diagnostics/hub.ts` | None |
| In the frame loop the recorder only writes numbers into preallocated rings. JSON and network work happen in a batch every 30 seconds outside the loop, and a period with no frames and no events sends nothing. | judgment | `apps/web/src/diagnostics/recorder.ts`, `apps/web/src/diagnostics/hub.ts` | None |
| A batch is validated against the Effect schema in `packages/telemetry/src/schema.ts` before a store acknowledges it. `limits.ts` has no dependencies so the browser can import it. | `pnpm test` | `packages/telemetry`, `apps/web/src/server/telemetry.ts` | None |
| The store is the `TelemetryStore` service. `vite.config.ts` gives `vite dev` and `vite preview` the JSONL Layer on the Node file system through `apps/web/src/server/telemetry-local.ts`, so `node:fs` never reaches the Worker. Tests use the memory Layer, which deduplicates and appends the same way. No store is chosen for a deployment yet. | `pnpm test`, judgment | `packages/telemetry/src`, `apps/web/vite.config.ts`, `apps/web/src/server/telemetry-local.ts` | None |
| Only a missing session file counts as empty. Any other failed read, or a non-blank line that is not a stored batch, fails the save with `StoreFailed` before anything is appended. | `pnpm test` | `packages/telemetry/src/jsonl-store.ts` | None |
| A stored line is `JSON.stringify({ batch, receivedAt })` and a newline, with the batch's version and optional quality fields as they arrived. `receivedAt` comes from Effect's `Clock`. | `pnpm test`, judgment | `packages/telemetry/src/schema.ts`, `apps/web/src/server/telemetry.ts`, `packages/telemetry/src/jsonl-store.ts` | None |
| The page queue holds 24 batches. A full queue drops its oldest batch that is not a report, or its oldest report when every batch is one. The final beacon is best effort and never counts as saved. The Effect delivery code loads with a dynamic import when a batch may first leave, never with the menu, game creation or the frame loop. | `pnpm test`, judgment | `apps/web/src/diagnostics/hub.ts`, `apps/web/src/diagnostics/uploader.ts`, `apps/web/src/diagnostics/uploader-runtime.ts` | None |

## Frame profiles

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `?prof` records each frame's CPU time per part and the draw calls and triangles per pass into preallocated arrays, read through `globalThis.__rushlineProfile`. | judgment | `apps/web/src/game/profile.ts` | None |
