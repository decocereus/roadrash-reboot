# Coding standards

Read this file before you write or review code, and review finished code against it before you call the work done. Read [errors.md](errors.md) before you add or change an error, and [observability.md](observability.md) before you add a recorded number, a log line or a profile counter. [architecture.md](architecture.md) says what the game is and how it is built.

Every rule names its check. A lint rule or a `pnpm` script enforces it, or `judgment` marks it for reviewers. `pnpm check:rules` fails when a named check is not an enabled lint rule or a `package.json` script. It also fails when a `rushline/` or `anti-slop/` rule enabled in `oxlint.config.ts` is not named in this file, [errors.md](errors.md) or [observability.md](observability.md). A new rule ships with its row. No rule has an exemption: there are no allowlists, baselines, or per-file disables, and code that breaks a rule is fixed. The ledger enforces that too. It works out each rule's setting the way oxlint does, preset rules first, then the root rules, then each override in order, and fails when `oxlint.config.ts` sets any rule below `error` in its root rules or in an override, or when a preset override turns off a rule that is otherwise on and no later override for the same files turns it back on. The Ultracite presets turn off `no-empty-function` and `promise/prefer-await-to-then` for test files, so `oxlint.config.ts` turns both back on there. A rule the presets leave off is not part of the standard.

## The checks

`pnpm check` runs the `check` group of `scripts/verify.ts`: formatting, lint, the lint rule tests, this ledger, CSS comments, the TypeScript-only check, types, and tests, in that order, and prints how long each took. `pnpm verify` runs the same group and then the build. Add `--format json` (`node scripts/verify.ts check --format json`) for one JSON report with each check's command, exit code, duration and the tail of its output when it failed. CI runs `pnpm check` and `pnpm build` as separate steps, so the Actions page shows which of the two failed without opening the log. It runs once for each pull request update and once for each push to `main`.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Run `pnpm check` and `pnpm build` after source changes. | `pnpm verify` | Repository | None |
| Code is formatted by oxfmt. | `pnpm format:check` | Repository | None |
| Repository code is TypeScript. No tracked or new `.js`, `.mjs`, `.cjs` or `.jsx` file exists. | `pnpm check:typescript-only` | Repository | None |
| Types check in the root project, `tools/oxlint`, and every workspace package. The checker is tsrs, the Rust port of the TypeScript 7 compiler, pinned to an exact version. | `pnpm typecheck` | Repository | None |
| Every lint plugin rule has valid and invalid cases, and the suite fails when a registered `rushline/` or `anti-slop/` rule has none. The same suite runs the ledger's regression cases in `scripts/rule-ledger.test.ts`. | `pnpm lint:rules` | `tools/oxlint`, `scripts` | None |
| Every rule in these docs names its check, every enabled project rule has a row, and `oxlint.config.ts` turns no rule off or below `error` anywhere it applies. | `pnpm check:rules` | `docs/coding-standards.md`, `docs/errors.md`, `docs/observability.md`, `oxlint.config.ts` | None |
| Look at the running game after any change to `apps/web/src/game` or to handling. Passing tests do not show that it plays well. | judgment | `apps/web/src/game`, `packages/sim` | None |

## Keep each module to its job

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `alchemy.run.ts` is the Alchemy composition root. `apps/` holds deployable Cloudflare apps, `packages/` holds shared code, and `tools/` holds repository automation. Create apps and packages there instead of new top-level folders. | judgment | Repository | None |
| `packages/sim` owns every game rule. If the game should behave differently, change `packages/sim`. | judgment | `packages/sim` | None |
| `packages/track` owns the track format, compilation and track data. The simulation and the renderer both read the compiled `Track`. | judgment | `packages/track` | None |
| `packages/career` owns every career rule: money, levels, the shop, the field draw, rival memory, settlement and the save format. React renders it and never changes a rule. | judgment | `packages/career` | None |
| `apps/web/src/game` owns rendering, audio, input and the frame loop. It reads simulation state and never changes a rule. | judgment | `apps/web/src/game` | None |
| React renders menus and the HUD, does no per-frame work, and loads the game module with a dynamic import. | judgment | `apps/web/src/components`, `apps/web/src/routes` | None |
| `packages/ui` owns the shadcn components and global styles. | judgment | `packages/ui` | None |

## Keep the simulation deterministic

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| No DOM, no Three.js, no `Math.random` and no clock. State is plain data, and `stepRace` advances it by one 1/60 second tick. | judgment | `packages/sim`, `packages/track`, `packages/career` | None |
| Randomness comes from the seeded generator in `packages/track`. | judgment | `packages/sim`, `packages/track`, `packages/career` | None |

## Tune the numbers before the model

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A bike's handling is its `BikeSpec`. Change numbers there before changing the model. | judgment | `packages/sim` | None |
| The tests in `packages/sim` pin the feel: acceleration, braking distance, how hard a bend pushes, which bend cannot be taken flat out, when the crest launches. When a tuning change breaks one, decide whether the feel or the test is wrong, and say which in the commit. | judgment | `packages/sim` | None |

## Use Effect only at the edges

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Effect runs at network, storage, process and error boundaries: the telemetry server, `packages/telemetry`, `tools/perf` and `tools/verify`. The simulation, track, career rules, renderer and React are plain functions. | judgment | Repository | None |
| Import Effect by module path, such as `effect/Effect` or `effect/Schema`, never from the `effect` root. | `no-restricted-imports` | Repository | None |
| Every promise is awaited, returned, or explicitly discarded with `void`. | `typescript/no-floating-promises` | Repository | None |
| A value typed `any`, such as the result of `JSON.parse`, is decoded or typed before typed code reads, calls, passes or returns it. | `typescript/no-unsafe-assignment`, `typescript/no-unsafe-argument`, `typescript/no-unsafe-call`, `typescript/no-unsafe-member-access`, `typescript/no-unsafe-return` | Repository | None |

The inherited Ultracite presets run with type information (`options: { typeAware: true }`), so every type-aware rule they turn on is enforced too, such as `typescript/strict-boolean-expressions` and `typescript/no-confusing-void-expression`. Every other rule they turn on is enforced in every file as well, such as `func-style` (functions are `const` arrow functions), `no-use-before-define`, `no-shadow`, `no-nested-ternary` and `promise/prefer-await-to-then`. Only the rules above are listed, because they state Rushline's own decisions.

## Keep types honest

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| No type assertion without a nearby `SAFETY:` note that says why the assertion holds. `as const` needs none. | `anti-slop/require-safety-comment-for-type-assertion` | Repository | None |
| A `SAFETY:` note ends with a `Verified by: <test title>` line, and a test with that exact `it` or `test` title exists under `apps/`, `packages/` or `tools/`. This is a separate rule, not an extension of the vendored anti-slop rule, so the vendored plugin stays a copy. | `rushline/safety-verified-by` | Repository | None |
| No chained assertions such as `value as unknown as User`. | `anti-slop/no-chained-type-assertions` | Repository | None |
| Do not widen a known value to a broad type and then assert it back to a narrower one. | `anti-slop/no-widen-then-assert` | Repository | None |
| Do not pass a value whose type is already known into a broad or anonymous target type that throws the evidence away. | `anti-slop/no-known-value-widening` | Repository | None |
| No dictionary type whose value is `unknown`, `any`, `object` or `{}`. | `anti-slop/no-unsafe-dictionary-type` | Repository | None |
| No `unknown` parameter except `cause`, no function that returns `unknown`, and no type alias that resolves to `unknown`. Decode unknown input at its I/O boundary. | `anti-slop/no-unknown-parameters`, `anti-slop/no-unknown-returns`, `anti-slop/no-unknown-type-aliases` | Repository | None |
| No parameter typed `object`. Name the type the function needs and parse input into it at its boundary. | `anti-slop/no-object-parameters` | Repository | None |
| No runtime `typeof` checks. External values are decoded into domain types at the boundary. | `anti-slop/no-runtime-typeof` | Repository | None |
| No `Reflect.get` or `Reflect.apply`. Use typed property access and direct calls. | `anti-slop/no-reflect-get`, `anti-slop/no-reflect-apply` | Repository | None |
| No conditional spread of an empty object to omit a field. | `anti-slop/no-conditional-empty-object-spread` | Repository | None |
| No symbol name contains `shape`. Name the thing the value is. | `anti-slop/no-shape-in-symbol-names` | Repository | None |

## Write no comments

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| No comments in `.ts`, `.tsx`, `.js` or `.mjs` files. Names, types and small functions carry the meaning; design rationale goes in `docs/` or the commit message. The comments allowed are tool directives: `oxlint-disable…`, `eslint-disable…`, `oxlint-enable` and `eslint-enable` lint directives, `@ts-expect-error`, a `SAFETY:` note and the line comments that continue it, `/// <reference …>`, `@vite-ignore`, `#__PURE__` and `@__PURE__` annotations, and a shebang. | `rushline/no-comments` | Repository | None |
| Every lint suppression and `@ts-expect-error` says why after `--`. `@ts-ignore` and `@ts-nocheck` are banned. Prefer code that needs no directive. | `rushline/require-suppression-reason` | Repository | None |
| No comments in CSS. The check tokenizes each CSS file with PostCSS, so a `/*` inside a string or a `url()` is not a comment. | `pnpm check:css-comments` | `*.css` | None |

## Test what a player would notice

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Test behaviour a player would notice, through `createRace` and `stepRace`. Do not write unit tests for helpers. | judgment | `packages/sim`, `packages/career`, `packages/track` | None |
| Do not mock modules. Replace a dependency through a real interface. | `anti-slop/no-module-mocking` | Repository | None |
| Tests pass. | `pnpm test` | Repository | None |
