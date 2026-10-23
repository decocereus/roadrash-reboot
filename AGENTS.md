# Repository guidance

Read `docs/architecture.md` first. It defines the game, the riding model, and the build order.

Read `docs/coding-standards.md` before you write or review code. It holds every rule for this repository: module ownership, determinism, tuning, Effect at the edges, types, comments, tests, and verification. Each rule names the lint rule or `pnpm` script that enforces it, or says `judgment`. `docs/errors.md` covers the telemetry endpoint, the uploader, and the career save. `docs/observability.md` covers play-test telemetry and frame profiles.

## Verification

- Run `pnpm check` and `pnpm build` after source changes, or `pnpm verify` for both.
- Look at the running game after any change to `apps/web/src/game` or to handling. Passing tests do not show that it plays well.
