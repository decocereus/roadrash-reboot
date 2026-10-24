# Repository guidance

Read `docs/architecture.md` first. It defines the game, the riding model, and the build order.

Find your way with `docs/feature-map.md` before you search. Each entry names one feature's files, tests, docs, verify recipes and perf budgets. The map is generated from `scripts/features.ts`. When you add, move or delete a source file, update that manifest and run `pnpm feature-map`; `pnpm check:feature-map` fails until you do.

Read `docs/coding-standards.md` before you write or review code. It holds every rule for this repository: module ownership, determinism, tuning, Effect at the edges, types, comments, tests, and verification. Each rule names the lint rule or `pnpm` script that enforces it, or says `judgment`. `docs/errors.md` covers the telemetry endpoint, the uploader, and the career save. `docs/observability.md` covers play-test telemetry and frame profiles.

## How to work here

The code is the record of how this repository does things. The next agent copies what you leave, so leave only what is worth copying.

- Check a pattern against `docs/coding-standards.md` before you copy it. If the nearest example breaks a rule or works around a problem, fix the cause. Build the better shape, move every caller to it in the same change, and delete the old one. Never leave two ways to do the same thing.
- Turn a repeated correction into structure. When a review or a fix corrects the same mistake a second time, or one mistake let a broken change pass its checks, add a lint rule in `tools/oxlint/rushline` or a check in `scripts/`. Give it a row in `docs/coding-standards.md` and fix every existing instance in the same pull request. There are no exemptions, so a rule that cannot hold everywhere is not ready. Mark a rule `judgment` only when no rule, check or type can express it.
- Make wrong states impossible to write before you guard against them. A list that must have an element is a non-empty tuple. A finite set of values is one `as const` tuple that both its type and its schema come from. An operation that must decide what every variant means is an exhaustive `switch` with no catch-all default.
- Put each rule in the package that owns it, and write it as data where you can, such as a table, a union or a state machine. `packages/sim` owns the game rules, `packages/career` owns the career rules, and the browser draws the race and forwards input.
- Delete before you add. Remove dead code, one-caller wrappers and stale fallbacks first, then build on what is left. Fix what a player, a caller or a check can actually hit, and add no fallback for a state the types already rule out.
- Fix the root cause. Reproduce the bug, find why it happens, and fix that. The regression test must fail when the old defect is put back in the layer where it lived, not in a helper beside it.
- Prove each change the way a player or a caller meets it, with the feature's verify recipes and perf budgets from the map. A new subsystem, such as a server route, a multiplayer room, sign-in or the store, ships with its own way to verify it. If it runs every frame or every tick, it also ships with a budget in `tools/perf/budgets.json`.
- Measure performance instead of guessing. Run `pnpm perf` before and after a change to the simulation or the build. Run `pnpm perf:gpu` before and after a change to the renderer, the scene or assets, because only it measures frame times and render counts. `docs/observability.md` says what each one checks and how to read a frame profile.
- Run parallel work in separate git worktrees, one lane per set of packages. Remove each worktree and its build output when its pull request merges or closes. Never leave files staged in a checkout another agent shares.

## Verification

- Run `pnpm check` and `pnpm build` after source changes, or `pnpm verify` for both.
- Look at the running game after any change to `apps/web/src/game` or to handling. Passing tests do not show that it plays well.

## Agent skills

Vendored, reviewed third-party agent skills live in `.claude/skills/<name>/` (one copy) and reach Codex through the `.agents/skills/<name>` symlinks, because Codex scans `.agents/skills/` from the working directory up to the repository root (OpenAI's Codex documentation, developers.openai.com/codex/build-skills). Claude Code reads them from `.claude/skills/`, where the repo's own skills (`verify-rushline`, `sessions`) also live. Each vendored skill carries a `LICENSE` and a `PROVENANCE.md` with its source URL, source commit, cuts, edits and the security review. Treat them as reviewed data and never run their setups or installers from anywhere else.

Use them when the work matches:

- Blender character work under `tools/blender/`: `blender-core` (router and bpy patterns), `blender-character-rigging`, `blender-asset-qa` (the delivery gate), `blender-game-optimization`, `blender-export-pipelines`, `blender-facial-shapekeys`, and `scenario-blender-expert` (execution protocol and review loop), `scenario-blender-rigging`, `scenario-blender-retopology`, `scenario-blender-export`, `scenario-blender-uv-baking` (numeric weight, retopo and export gates).
- Three.js work in `apps/web/src/game`: `threejs-materials`, `threejs-loaders`, `threejs-animation`, `threejs-asset-pipeline`, `threejs-performance`, `threejs-shaders`.
- GLB audit and compression questions around `tools/blender/compress.ts`: `glb-web-export`.
