# Repository guidance

Read three files before any work: this one, `docs/architecture.md`, which defines the game and the platform and links each area's design, and `docs/coding-standards.md`, which holds the rules that apply to every change. Then read what the route table sends you to for each path you change. Each rule names the lint rule or `pnpm` script that enforces it, or says `judgment`.

Find your way with `docs/feature-map.md` before you search. Each entry names one feature's files, tests, docs, verify recipes and perf budgets. The map is generated from `scripts/features.ts`. When you add, move or delete a source file, update that manifest and run `pnpm feature-map`; `pnpm check:feature-map` fails until you do.

## Read before you change a path

A path that matches several rows takes every file they name. Rules are binding; read every file in the Rules column for the paths you change, before you write or review code there. Design files say how that area is built. `pnpm check:rule-routes` fails when a rule table sits in a file this table does not route.

| Paths | Rules | Design |
| --- | --- | --- |
| `**` | `docs/coding-standards.md` | `docs/architecture.md` |
| `apps/web/**`, `packages/**` | `docs/observability.md` | `docs/architecture/browser-client.md` |
| `packages/sim/**`, `tools/handling/**`, `tools/replay/**`, `apps/rooms/src/race-tally.ts`, `scripts/deterministic-scopes.test.ts`, `.github/workflows/quality.yml` | `docs/standards/simulation.md`, `docs/observability.md` | `docs/architecture/riding-model.md`, `docs/architecture/race-setup.md`, `docs/handling-matrix.md` |
| `packages/track/**`, `tools/madrid/**`, `tools/road-test/**` | `docs/standards/simulation.md`, `docs/observability.md` | `docs/architecture/tracks.md`, `docs/madrid-corridor.md` |
| `packages/career/**`, `packages/content/**` | `docs/standards/simulation.md`, `docs/observability.md` | `docs/architecture/career.md`, `docs/architecture/race-setup.md` |
| `apps/web/src/game/**`, `apps/web/test/**`, `apps/web/public/**` | `docs/standards/renderer.md`, `docs/standards/simulation.md`, `docs/errors.md` | `docs/architecture/browser-client.md`, `docs/gpu-work.md` |
| `apps/web/src/*.ts`, `apps/web/src/*.tsx`, `apps/web/src/components/**`, `apps/web/src/routes/**`, `apps/web/src/career/**`, `apps/web/src/game/hud.ts`, `apps/web/src/game/race-feedback.ts`, `apps/web/src/game/bar-signs.ts`, `apps/web/vite.config.ts`, `packages/ui/**` | `docs/standards/web-app.md`, `docs/errors.md` | `docs/architecture/browser-client.md` |
| `apps/rooms/**`, `tools/rooms/**` | `docs/standards/effect.md`, `docs/observability.md` | `docs/architecture/race-rooms.md`, `docs/durable-object-http.md` |
| `apps/web/src/server/**`, `apps/web/src/diagnostics/**`, `apps/web/src/routes/api/**`, `packages/telemetry/**` | `docs/standards/effect.md`, `docs/errors.md` | `docs/architecture/browser-client.md` |
| `apps/web/src/asset-runtime.ts`, `apps/web/src/assets/**`, `apps/web/src/rules/**`, `apps/web/src/career/save*.ts`, `packages/career/src/save*.ts`, `packages/career/src/rules-schema.ts`, `packages/track/src/madrid-*.ts` | `docs/standards/effect.md`, `docs/errors.md` | `docs/architecture/game-art.md`, `docs/architecture/career.md` |
| `tools/perf/**`, `tools/verify/**`, `packages/devtools/**`, `.claude/skills/sessions/**` | `docs/standards/effect.md`, `docs/observability.md` | `docs/gpu-work.md` |
| `tools/art/**`, `tools/madrid/**`, `tools/road-test/**` | `docs/standards/effect.md`, `docs/errors.md` | `docs/architecture/game-art.md` |
| `tools/blender/**` | None beyond the core | `docs/architecture/game-art.md`, `docs/gpu-work.md` |
| `scripts/**`, `tools/oxlint/**`, `.github/**`, `oxlint.config.ts`, `package.json`, `AGENTS.md`, `docs/coding-standards.md`, `docs/standards/**`, `docs/errors.md`, `docs/observability.md` | `docs/standards/tooling.md` | `docs/architecture/deploy.md` |

## How to work here

The code is the record of how this repository does things. The next agent copies what you leave, so leave only what is worth copying.

- Check a pattern against the rules for its paths before you copy it. If the nearest example breaks a rule or works around a problem, fix the cause. Build the better shape, move every caller to it in the same change, and delete the old one. Never leave two ways to do the same thing.
- Turn a repeated correction into structure. When a review or a fix corrects the same mistake a second time, or one mistake let a broken change pass its checks, add a lint rule in `tools/oxlint/rushline` or a check in `scripts/`. Give it a row in the rule doc that the route table below sends that path to, and fix every existing instance in the same pull request. There are no exemptions, so a rule that cannot hold everywhere is not ready. Mark a rule `judgment` only when no rule, check or type can express it.
- Make wrong states impossible to write before you guard against them. A list that must have an element is a non-empty tuple. A finite set of values is one `as const` tuple that both its type and its schema come from. An operation that must decide what every variant means is an exhaustive `switch` with no catch-all default.
- Put each rule in the package that owns it, and write it as data where you can, such as a table, a union or a state machine. `packages/sim` owns the game rules, `packages/career` owns the career rules, and the browser draws the race and forwards input.
- Delete before you add. Remove dead code, one-caller wrappers and stale fallbacks first, then build on what is left. Fix what a player, a caller or a check can actually hit, and add no fallback for a state the types already rule out.
- Fix the root cause. Reproduce the bug, find why it happens, and fix that. The regression test must fail when the old defect is put back in the layer where it lived, not in a helper beside it.
- Prove each change the way a player or a caller meets it, with the feature's verify recipes and perf budgets from the map. A new subsystem, such as a server route, a multiplayer room, sign-in or the store, ships with its own way to verify it. If it runs every frame or every tick, it also ships with a budget in `tools/perf/budgets.json`.
- Measure performance instead of guessing. Run `pnpm perf` before and after a change to the simulation or the build. Run `pnpm perf:gpu` before and after a change to the renderer, the scene or assets, because only it measures frame times and render counts. `docs/observability.md` says what each one checks and how to read a frame profile.
- Run parallel work in separate git worktrees, one lane per set of packages. Remove each worktree and its build output when its pull request merges or closes. Never leave files staged in a checkout another agent shares.

## Verification

- A session that starts in a checkout behind `origin/main` gets one warning with the commit count, from `scripts/stale-checkout.ts` through `.claude/settings.json` and `.codex/hooks.json`. Merge or rebase onto `origin/main` before you build on, review or merge that branch.
- Run `pnpm check` and `pnpm build` after source changes, or `pnpm verify` for both.

GPU-heavy work, such as `rv` checks of the renderer, the scene and assets, frame profiles, `pnpm perf:gpu` and Blender renders, runs on `vimaan` under a booking. Read `docs/gpu-work.md` before any of it.

## Agent skills

Vendored, reviewed third-party agent skills live in `.claude/skills/<name>/` (one copy) and reach Codex through the `.agents/skills/<name>` symlinks, because Codex scans `.agents/skills/` from the working directory up to the repository root (OpenAI's Codex documentation, developers.openai.com/codex/build-skills). Claude Code reads them from `.claude/skills/`, where the repo's own skills (`verify-rushline`, `sessions`, `road-building`) also live. Each vendored skill carries a `LICENSE` and a `PROVENANCE.md` with its source URL, source commit, cuts, edits and the security review. Treat them as reviewed data and never run their setups or installers from anywhere else.

Use them when the work matches:

- Blender character work under `tools/blender/`: `blender-core` (router and bpy patterns), `blender-character-rigging`, `blender-asset-qa` (the delivery gate), `blender-game-optimization`, `blender-export-pipelines` and `blender-facial-shapekeys`. The scenario-labs/skills blender collection was reviewed and deliberately not vendored: scenario-labs is MIT, but most of its Blender material is a port, by a Scenario employee, of edemaistre/blender-expert-skills, which has no licence, and there is no confirmation that the grant covers the ported files, so re-vendoring it needs a demonstrated right first.
- Three.js work in `apps/web/src/game`: `threejs-materials`, `threejs-loaders`, `threejs-animation`, `threejs-asset-pipeline`, `threejs-performance`, `threejs-shaders`.
- GLB audit and compression questions around `tools/blender/compress.ts`: `glb-web-export`.
- Adding or changing a road under `packages/track/src/tracks`: `road-building`.
