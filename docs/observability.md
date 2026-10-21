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
| The store is injected. `vite.config.ts` provides the JSONL store for `vite dev` and `vite preview`, so `node:fs` never reaches the Worker. | judgment | `apps/web/vite.config.ts`, `packages/telemetry/src/store.ts` | None |

## Frame profiles

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `?prof` records each frame's CPU time per part and the draw calls and triangles per pass into preallocated arrays, read through `globalThis.__rushlineProfile`. | judgment | `apps/web/src/game/profile.ts` | None |
