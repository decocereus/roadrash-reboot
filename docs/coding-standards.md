# Coding standards

Read this file before you write or review code, and review finished code against it before you call the work done. Read [errors.md](errors.md) before you add or change an error, and [observability.md](observability.md) before you add a recorded number, a log line or a profile counter. [architecture.md](architecture.md) says what the game is and how it is built.

Every rule names its check. A lint rule or a `pnpm` script enforces it, or `judgment` marks it for reviewers. `pnpm check:rules` fails when a named check is not an enabled lint rule or a `package.json` script. It also fails when a `rushline/` or `anti-slop/` rule enabled in `oxlint.config.ts` is not named in this file, [errors.md](errors.md) or [observability.md](observability.md). A new rule ships with its row. No rule has an exemption: there are no allowlists, baselines, or per-file disables, and code that breaks a rule is fixed. The ledger enforces that too. It works out each rule's setting the way oxlint does, preset rules first, then the root rules, then each override in order, and fails when `oxlint.config.ts` sets any rule below `error` in its root rules or in an override, or when a preset override turns off a rule that is otherwise on and no later override for the same files turns it back on. The Ultracite presets turn off `no-empty-function` and `promise/prefer-await-to-then` for test files, so `oxlint.config.ts` turns both back on there. A rule the presets leave off is not part of the standard.

## The checks

`pnpm check` runs the `check` group of `scripts/verify.ts`: formatting, lint, the lint rule tests, this ledger, CSS comments, the TypeScript-only check, the repository roots, source size, the save format, dead code, types, and tests, in that order, and prints how long each took. `pnpm verify` runs the same group and then the build. Add `--format json` (`node scripts/verify.ts check --format json`) for one JSON report with each check's command, exit code, duration and the tail of its output when it failed. CI runs `pnpm check` and `pnpm build` as separate steps, so the Actions page shows which of the two failed without opening the log. It runs once for each pull request update and once for each push to `main`.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Run `pnpm check` and `pnpm build` after source changes. | `pnpm verify` | Repository | None |
| Code is formatted by oxfmt. | `pnpm format:check` | Repository | None |
| Repository code is TypeScript. No tracked or new `.js`, `.mjs`, `.cjs` or `.jsx` file exists. | `pnpm check:typescript-only` | Repository | None |
| Types check in the root project and every workspace. The checker is tsrs, the Rust port of the TypeScript 7 compiler, pinned to an exact version. | `pnpm typecheck` | Repository | None |
| Every lint plugin rule has valid and invalid cases, and the suite fails when a registered `rushline/` or `anti-slop/` rule has none. The same suite runs the ledger's regression cases in `scripts/rule-ledger.test.ts`. | `pnpm lint:rules` | `tools/oxlint`, `scripts` | None |
| Every rule in these docs names its check, every enabled project rule has a row, and `oxlint.config.ts` turns no rule off or below `error` anywhere it applies. | `pnpm check:rules` | `docs/coding-standards.md`, `docs/errors.md`, `docs/observability.md`, `oxlint.config.ts` | None |
| Look at the running game after any change to `apps/web/src/game` or to handling. Passing tests do not show that it plays well. | judgment | `apps/web/src/game`, `packages/sim` | None |

## Keep each module to its job

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| `alchemy.run.ts` is the Alchemy composition root. `apps/` holds deployable Cloudflare apps, `packages/` holds shared code, `tools/` holds repository automation, `scripts/` holds the checks, and `docs/` the docs. No other top-level folder exists, apart from dot folders. Every folder under `apps/`, `packages/` and `tools/` is a pnpm workspace with its own `package.json`, and `pnpm-workspace.yaml` matches each of them and nothing else. | `pnpm check:roots` | Repository | None |
| No relative import leaves its workspace. A workspace is the folder of the nearest `package.json`. Code another workspace uses is imported by its package name, such as `@racer/telemetry/jsonl-store`, and every workspace declares each package it imports in its own `package.json`, including `@racer/*` workspaces and packages the root already declares. `node:` builtins and the workspace's own name need no declaration. Unused declarations are covered by the `pnpm check:dead` row. | `rushline/workspace-imports` | Repository | None |
| Every TS, TSX, CSS and SQL source file is at most 20,000 JavaScript string characters, counted as `readFileSync(file, "utf-8").length`; 20,000 passes and 20,001 fails. Split a larger file by what its parts own, and keep new files well under the limit. The check reads every tracked file and every untracked file Git does not ignore, so build output and other ignored files are not counted. | `pnpm check:size` | Tracked and non-ignored untracked source, repository-wide | None |
| No file, export, type or dependency is left unused. An export used only in its own file loses `export`. Delete the rest, and the docs that describe it. knip checks every workspace, and checks the exports of `packages/*` too, although each of their files is a package entry. `knip.json` has no ignore option. | `pnpm check:dead` | Repository | None |
| `packages/sim` owns every game rule. If the game should behave differently, change `packages/sim`. | judgment | `packages/sim` | None |
| `packages/track` owns the track format, compilation and track data. The simulation and the renderer both read the compiled `Track`. | judgment | `packages/track` | None |
| `packages/career` owns every career rule: money, levels, the shop, the field draw, rival memory, settlement and the save format. React renders it and never changes a rule. | judgment | `packages/career` | None |
| A change to the encoded career save needs a new `SAVE_VERSION` and a new fingerprint in `packages/career/save-format.json`. A committed fingerprint is never rewritten or removed. | `pnpm check:save-format` | `packages/career/src/save*.ts`, `packages/career/save-format.json` | None |
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
| Effect runs at network, storage, process and error boundaries: the telemetry server, `packages/telemetry`, the browser's telemetry delivery (`apps/web/src/diagnostics/upload` and `uploader-runtime.ts`, loaded on demand), `packages/devtools` (launching Chrome or Helium, the CDP client and trace analysis, which `tools/perf` and `tools/verify` share), `tools/perf`, `tools/verify` and the career save codec. The simulation, track, career rules, renderer and React are plain functions. | judgment | Repository | None |
| Import Effect by module path, such as `effect/Effect` or `effect/Schema`, never from the `effect` root. | `no-restricted-imports` | Repository | None |
| Every promise is awaited, returned, or explicitly discarded with `void`. | `typescript/no-floating-promises` | Repository | None |
| Look up an Effect API in the installed source first: `node_modules/effect/src` and the package's `exports`, then `node_modules/@effect/platform-node/src`, then Alchemy's own source, such as `alchemy/src/Runtime.ts`, for what its wrappers do. Use the pinned Effect checkout only when you need code or tests that the package does not ship. `pnpm effect:reference` creates it at `.references/effect`, at commit `67ba4e46a11ccda0b6761578bfd22c04ae00167d`, which is Effect 4.0.0, the version the root `package.json` pins. On every run it checks that the installed Effect matches the root pin, that `.references/effect` is ignored and untracked, and that an existing checkout is clean, at that commit and at that version. It never fetches into, resets or cleans an existing checkout: a mismatch is an error that leaves the checkout as it is. It is not part of `pnpm check`, the build or CI, and it uses the network only when the checkout is missing. Do not copy API examples from the Effect website, which may describe another version. | `pnpm effect:reference` | Development setup | None |
| A value typed `any`, such as the result of `JSON.parse`, is decoded or typed before typed code reads, calls, passes or returns it. | `typescript/no-unsafe-assignment`, `typescript/no-unsafe-argument`, `typescript/no-unsafe-call`, `typescript/no-unsafe-member-access`, `typescript/no-unsafe-return` | Repository | None |

The inherited Ultracite presets run with type information (`options: { typeAware: true }`), so every type-aware rule they turn on is enforced too, such as `typescript/strict-boolean-expressions` and `typescript/no-confusing-void-expression`. Every other rule they turn on is enforced in every file as well, such as `func-style` (functions are `const` arrow functions), `no-use-before-define`, `no-shadow`, `no-nested-ternary` and `promise/prefer-await-to-then`. Only the rules above are listed, because they state Rushline's own decisions.

The boundary rules below apply to three file lists, each defined once in `oxlint.config.ts`:

- `effectFiles`: the entries and `src/` folders of `tools/perf` and `tools/verify` (`tools/perf/*.ts`, `tools/perf/src/**/*.ts`, `tools/verify/*.ts`, `tools/verify/src/**/*.ts`), `packages/devtools/src/**/*.ts`, and the telemetry boundary: `apps/web/src/server/**/*.ts`, the route `apps/web/src/routes/api/telemetry.ts`, `packages/telemetry/src/**/*.ts`, the queue `apps/web/src/diagnostics/uploader.ts`, the browser entry `apps/web/src/diagnostics/uploader-runtime.ts` and `apps/web/src/diagnostics/upload/**/*.ts`; and the save codec, `save.ts` and the `save-*.ts` modules in `packages/career/src`, without their tests.
- `orchestrationFiles`: the same files without `packages/devtools/src/node/`. That folder holds the one Node adapter, `detached-process.ts`, which starts the detached server and watcher with their log file inherited as stdout and stderr, because the platform process API cannot pass a file descriptor. New orchestration never goes there.
- `libraryFiles`: the same files without the entries. Only the entries run an Effect: `tools/perf/measure.ts`, `tools/perf/session.ts`, `tools/verify/rushline.ts`, the telemetry route and `uploader-runtime.ts`.

The diagnostics hub, the recorder, React and `vite.config.ts` stay outside these lists. Tests live in each workspace's `test/` folder, outside them too, and every other rule in this file still applies to them. `scripts/telemetry-scopes.test.ts` checks which of these rules reach sample paths of each role. The rules match names and syntax. They do not follow types or data flow, so a review still checks what they cannot see, such as a service method whose Effect is dropped.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| No `async` function, `Promise` or `PromiseLike` type, `.then`, `new Promise`, `Promise.*` call or top-level `await`, except inside an `Effect.promise` or `Effect.tryPromise` thunk. A Promise API is wrapped once with `Effect.tryPromise`. | `rushline/no-promise` | `effectFiles` | None |
| No import, re-export, `require` or dynamic import of `fs` or `child_process`, with or without `node:` and with any subpath. Files go through the `FileSystem` service, short commands through `ChildProcessSpawner`, and detached children through the Node adapter. | `rushline/no-node-io` | `orchestrationFiles` | None |
| No runner whose name starts with `runPromise`, `runSync`, `runFork`, `runCallback` or `runMain`, no `ManagedRuntime` or `NodeRuntime`, and no import from `effect/Runtime`, `effect/ManagedRuntime` or `@effect/platform-node/NodeRuntime`. Library code returns Effects, and the entries run them. | `rushline/no-effect-runtime` | `libraryFiles` | None |
| An Effect built from the imported `Effect` module is yielded, returned or composed, never left as a statement. The rule sees `Effect.*` calls and their `.pipe` chains, not a service method that returns an Effect. | `rushline/no-floating-effect` | `effectFiles` | None |
| An exported operation or a service `.of` method built directly from `Effect.gen` is a named `Effect.fn`. A private generator may stay `Effect.gen`. | `rushline/prefer-effect-fn` | `effectFiles` | None |
| Consecutive `Effect.catchTag` steps on different tags in one call are one `Effect.catchTags`. | `rushline/prefer-catch-tags` | `effectFiles` | None |
| A Schema decoder, encoder or guard over a static schema is built once at module scope, never inside a function on every call. A schema built from a function's parameters is not static, so it is compiled where it arrives. | `rushline/no-inline-schema-compile` | `effectFiles` | None |
| An `Effect.mapError` handler, or the `catch` of `Effect.try` or `Effect.tryPromise`, uses the failure it receives, normally as the new error's `cause`, or comes right after an `Effect.tapError`, `tapCause` or `tapErrorCause` that uses it. The rule checks that the failure is referenced, not that it reaches `cause`. | `rushline/require-wrapped-cause` | `effectFiles` | None |
| No `Effect.ignore`, `Effect.ignoreLogged` or `Effect.orDie`. Propagate the typed error, turn an expected absence into an outcome with `catchTag` or `catchReason`, and record a failed cleanup as a cleanup outcome. | `rushline/no-swallowed-failure` | `effectFiles` | None |
| Inside an `Effect.catch`, `catchAll` or `catchIf` handler, do not compare or switch on `_tag` or `reason._tag`. Use `Effect.catchTag`, `catchTags`, `catchReason` or `catchReasons`. | `rushline/no-manual-effect-error-tag` | `effectFiles` | None |
| Do not compare `_tag` with a string or switch on `_tag`. Use the `Option` helpers, `Match.tag` or `Predicate.isTagged`. | `rushline/no-manual-tag-comparison` | `effectFiles` | None |
| Do not write an object literal with a string `_tag`. Build a tagged value with its constructor, such as a `Schema.TaggedError` class. | `rushline/no-manual-tagged-construction` | `effectFiles` | None |
| Do not import a named `make<Name>` export from a relative path or an `@racer/` workspace. Import the service tag or its Layer and yield the service. | `rushline/no-service-constructor-imports` | `libraryFiles` | None |
| A chain of ternaries that compares one value with literals is a `Match`. | `rushline/prefer-effect-match` | `effectFiles` | None |

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
