# Repository guidance

Read `docs/architecture.md` first. It defines the game, the riding model, and the build order.

## Modules

- `alchemy.run.ts` is the Alchemy composition root. `apps/` holds deployable Cloudflare apps. `packages/` holds shared code. Create apps and packages there instead of inventing new top-level folders.
- `packages/sim` owns every game rule. It must stay deterministic: no DOM, no Three.js, no `Math.random`, no clock. State is plain data and `stepRace` advances it by one 1/60 second tick. Randomness comes from a seeded generator in `packages/track`.
- `packages/track` owns the track format, compilation, and track data. The simulation and the renderer both read the compiled `Track`.
- `apps/web/src/game` owns rendering, audio, input, and the frame loop. It reads simulation state and never changes a rule. If the game should behave differently, change `packages/sim`.
- React renders menus and the HUD. It does no per-frame work, and the game module is loaded with a dynamic import.
- `packages/ui` owns shadcn components and global styles.
- `tools/` owns repository automation.
- Server code, when it returns, follows the Faceless Effect conventions: Effect at network, storage, and error boundaries, and plain functions for the simulation.

## Tuning

- A bike's handling is its `BikeSpec`. Change numbers there before changing the model.
- The tests in `packages/sim` pin the feel: acceleration, braking distance, how hard a bend pushes, which bend cannot be taken flat out, when the crest launches. When a tuning change breaks one, decide whether the feel or the test is wrong, and say which in the commit.

## Comments

- Do not write comments in code or CSS. Names, types, and small functions carry the meaning; put design rationale in `docs/` or the commit message.
- The only exceptions are tool directives: lint suppressions with a reason, `@ts-expect-error`, and the `SAFETY:` note the anti-slop lint requires before a type assertion. Prefer code that needs none of them.

## Tests

- Test behaviour a player would notice, through `createRace` and `stepRace`. Do not write unit tests for helpers.
- Do not mock modules.

## Verification

- Run `pnpm check` and `pnpm build` after source changes.
- Look at the running game after any change to `apps/web/src/game` or to handling. Passing tests do not show that it plays well.
