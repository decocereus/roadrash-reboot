# Coding standards

Read this file before you write or review code, and review finished code against it before you call the work done. Read [errors.md](errors.md) before you add or change an error, and [observability.md](observability.md) before you add a recorded number, a log line or a profile counter. [architecture.md](architecture.md) says what the game is and how it is built.

Every rule names its check. A lint rule or a `pnpm` script enforces it, or `judgment` marks it for reviewers. `pnpm check:rules` fails when a named check is not an enabled lint rule or a `package.json` script. It also fails when a `rushline/` or `anti-slop/` rule enabled in `oxlint.config.ts` is not named in this file, [errors.md](errors.md) or [observability.md](observability.md). A new rule ships with its row. No rule has an exemption: there are no allowlists, baselines, or per-file disables, and code that breaks a rule is fixed. The ledger enforces that too. It works out each rule's setting the way oxlint does, preset rules first, then the root rules, then each override in order, and fails when `oxlint.config.ts` sets any rule below `error` in its root rules or in an override, or when a preset override turns off a rule that is otherwise on and no later override for the same files turns it back on. The Ultracite presets turn off `no-empty-function` and `promise/prefer-await-to-then` for test files, so `oxlint.config.ts` turns both back on there. A rule the presets leave off is not part of the standard.

## The checks

`pnpm check` runs the `check` group of `scripts/verify.ts`: formatting, lint, the lint rule tests, this ledger, CSS comments, the TypeScript-only check, the repository roots, the renderer imports, source size, the save format, dead code, the perf budgets, types, and tests, in that order, and prints how long each took. `pnpm verify` runs the same group, then the build, then the perf gate, `pnpm perf`. Add `--format json` (`node scripts/verify.ts check --format json`) for one JSON report with each check's command, exit code, duration and the tail of its output when it failed. `node scripts/verify.ts static` runs the group without the tests. CI runs four jobs side by side, once for each pull request update and once for each push to `main`. The `static` job runs `node scripts/verify.ts static` and then `pnpm build` as separate steps, so the Actions page shows which of the two failed without opening the log. `tests (police)` runs the police balance test, `pnpm test --project police`, on a runner of its own, because its 200 races fill every core. `tests (!police)` runs every other test, so the two test jobs together run what `pnpm test` runs. The `perf` job runs `pnpm perf`. Nothing in CI runs `pnpm perf:gpu`, which needs this Mac's GPU; [observability.md](observability.md) lists what each perf command checks.

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
| Within one `SAVE_VERSION` the encoded career save keeps its structure: its field names, which fields are required or optional, nullability, types, structural literals such as board-note kinds, results and endings, and fixed bounds. `scripts/save-wire.ts` reduces the JSON Schema Effect generates to that structure and refuses any construct it cannot read, so a change in how Effect writes the schema needs adapter support, not a new version. The seven catalogues (bikes, roads, levels, racers, rivals, weapons, officers) only grow: `packages/career/save-format.json` lists each version's IDs, the schema and the registry list the same IDs, and an ID any committed registry listed is never removed. Adding a bike, road, weapon or officer needs no new version. A new rival or level adds a required `memory`, `season` or `qualified` row, so it changes the structure. A changed structure needs a new `SAVE_VERSION`, agreed with the owner. A committed `fingerprint` or `wireFingerprint` is never rewritten or removed. | `pnpm check:save-format` | `packages/career/src/save*.ts`, `packages/career/save-format.json` | None |
| `apps/web/src/game` owns rendering, audio, input and the frame loop. It reads simulation state and never changes a rule. | judgment | `apps/web/src/game` | None |
| Each game releases what it made exactly once, in reverse order, through the owner list in `createGame`, on dispose or when construction throws partway, and a second dispose does nothing. A world owns its scene, textures, shadow map and cel ramp; actors and figures share that ramp and never release it. `disposeTree` releases each shared geometry, material, instanced mesh and point cloud once and leaves textures to their owners. Warm-up puts back everything it staged, even when the draw or the setup throws. | `pnpm test` | `apps/web/src/game`, `apps/web/test/renderer-lifecycle.test.ts` | None |
| Each shader preparation ends in exactly one outcome: `ready`, `timedOut`, `failed` with its stage and cause, `lost` or `cancelled`. It leaves no deadline or poll behind, only the newest preparation warms, nothing warms while the WebGL context is lost, and a late ready after a timeout, a replacement or an unmount does nothing. | `pnpm test` | `apps/web/src/game/preparation.ts`, `apps/web/test/preparation.test.ts` | None |
| React renders menus and the HUD, does no per-frame work, and loads the game module with a dynamic import. | judgment | `apps/web/src/components`, `apps/web/src/routes` | None |
| No static value import from React reaches `apps/web/src/game` or the `three` package; React imports their types with `import type` and loads the game through the literal dynamic imports in `apps/web/src/asset-load.ts`. The check starts at every `apps/web/src/**/*.tsx` file, resolves each import with the client build's Vite resolver, and follows value imports, value re-exports, side-effect imports and CommonJS `require` through every module, first-party or installed, before tree shaking. It judges a module by its real path, or by the package that owns it, and prints the chain of imports, with line numbers, to each crossing. An import it cannot resolve, a file it cannot parse, or a dynamic import of a computed specifier is an error. | `pnpm check:renderer-imports` | `apps/web/src/**/*.tsx` and every module they import statically | None |
| `packages/ui` owns the shadcn components and global styles. | judgment | `packages/ui` | None |

## Keep the simulation deterministic

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| The simulation, track and career rule modules import only each other, and every import and re-export resolves to one of them. They read no clock, no unseeded randomness, no browser or Node state, and no Effect, Three.js or loader. State is plain data, and `stepRace` advances it by one 1/60 second tick. | `rushline/deterministic-core` | `deterministicFiles` in `oxlint.config.ts`: the sim, track and career rule modules | None |
| The deterministic modules use only the exact members of `Math`: `abs`, `ceil`, `clz32`, `floor`, `fround`, `imul`, `max`, `min`, `round`, `sign`, `sqrt`, `trunc` and the eight constants. ECMAScript lets each engine approximate `sin`, `cos`, `atan2`, `hypot`, `pow`, `**` and the other transcendental functions its own way, and V8 rounds them differently on arm64 and x64, so the lint rule rejects `**` and every other member, including any member added to `Math` later. `sin`, `cos`, `atan` and `hypot2` come from `@racer/track/math`, a port of FreeBSD msun 12.2 that uses only `+ - * /` and `Math.sqrt` ([notices](../packages/track/THIRD_PARTY_NOTICES.md)), and an integer power is a multiplication. `packages/track/src/math.test.ts` pins their output bits to golden vectors taken from Rust's libm. | `rushline/deterministic-core`, `pnpm test` | `deterministicFiles` | None |
| Randomness comes from the seeded generator in `packages/track/src/random.ts`, and each consumer keeps its seed in state. The lint rule rejects ambient entropy and imports from outside the core; whether hand-written arithmetic is a second generator is for review. | `rushline/deterministic-core`, judgment | `deterministicFiles` | None |
| The named tick, frame, planner and input bodies build no function, object, array, rest or spread container, `new` instance or `subarray` view directly. This covers the body's own syntax, not the functions it calls, so it is not an allocation budget. | `rushline/no-hot-allocation` | `hotBodies` in `oxlint.config.ts` | None |
| Every sim, track and career module has exactly one role: deterministic rules and data, save codec, or test. The save codecs are the career's I/O boundary and get the Effect rules. Every listed hot body exists, once. | `pnpm test`, `pnpm lint:rules` | `scripts/deterministic-scopes.test.ts`, `rushline/no-hot-allocation` | None |
| Each race owns its mutable pilot memory. Module-level buffers hold only scratch that each plan overwrites before reading, so one race can never read another's history. | `pnpm test` | `apps/web/test/pilot-replay.test.ts` | None |
| The browser reads a race through the deeply readonly `RaceView`, the race itself and not a copy, and changes it only through `RaceRun` and the commands in `packages/sim/src/commands.ts`. | `pnpm typecheck`, `pnpm test` | `packages/sim/src/race-view.ts`, `race-run.ts`, `apps/web/src/game`, `packages/career/src/outcome.ts` | None |
| Fixed ticks, held and repeated keys, replays of the same inputs and races run side by side match tick for tick, and render quality, pixel ratio, pacing, sound and the profiler never change a tick. | `pnpm test` | `apps/web/test/fixed-tick.test.ts`, `input.test.ts`, `pilot-replay.test.ts`, `render-quality.test.ts` | None |
| The HUD publishes one regular snapshot each time 1/15 s of processed frame time builds up: each rendered frame adds its clamped seconds, a total of 1/15 s or more publishes once and resets to zero, and the remainder is dropped. Halted frames add nothing. A race being prepared, the attract loop, a quit, sleep or mute publishes at once, apart from that clock. | `pnpm test` | `apps/web/src/game/hud-cadence.ts`, `apps/web/test/hud-cadence.test.ts` | None |

## Tune the numbers before the model

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A bike's handling is its `BikeSpec`. Change numbers there before changing the model. [handling-matrix.md](handling-matrix.md) lists what each field means, what reads it and which test pins it. | judgment | `packages/sim` | None |
| The tests in `packages/sim` pin the feel: acceleration, braking distance, how hard a bend pushes, which bend cannot be taken flat out, when the crest launches. When a tuning change breaks one, decide whether the feel or the test is wrong, and say which in the commit. | judgment | `packages/sim` | None |

## Use Effect only at the edges

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Effect runs at network, storage, process and error boundaries: the telemetry server, `packages/telemetry`, the browser's telemetry delivery (`apps/web/src/diagnostics/upload` and `uploader-runtime.ts`, loaded on demand), `packages/devtools` (launching Chrome or Helium, the CDP client and trace analysis, which `tools/perf` and `tools/verify` share), `tools/perf`, `tools/verify`, the career save codec, the browser save (`apps/web/src/career/save.ts` and its storage modules) and the game's model downloads (`apps/web/src/asset-runtime.ts` and `apps/web/src/assets`, loaded on demand). The simulation, track, career rules, renderer and React are plain functions. | judgment | Repository | None |
| Import Effect by module path, such as `effect/Effect` or `effect/Schema`, never from the `effect` root. | `no-restricted-imports` | Repository | None |
| Every promise is awaited, returned, or explicitly discarded with `void`. | `typescript/no-floating-promises` | Repository | None |
| Look up an Effect API in the installed source first: `node_modules/effect/src` and the package's `exports`, then `node_modules/@effect/platform-node/src`, then Alchemy's own source, such as `alchemy/src/Runtime.ts`, for what its wrappers do. Use the pinned Effect checkout only when you need code or tests that the package does not ship. `pnpm effect:reference` creates it at `.references/effect`, at commit `67ba4e46a11ccda0b6761578bfd22c04ae00167d`, which is Effect 4.0.0, the version the root `package.json` pins. On every run it checks that the installed Effect matches the root pin, that `.references/effect` is ignored and untracked, and that an existing checkout is clean, at that commit and at that version. It never fetches into, resets or cleans an existing checkout: a mismatch is an error that leaves the checkout as it is. It is not part of `pnpm check`, the build or CI, and it uses the network only when the checkout is missing. Do not copy API examples from the Effect website, which may describe another version. | `pnpm effect:reference` | Development setup | None |
| A value typed `any`, such as the result of `JSON.parse`, is decoded or typed before typed code reads, calls, passes or returns it. | `typescript/no-unsafe-assignment`, `typescript/no-unsafe-argument`, `typescript/no-unsafe-call`, `typescript/no-unsafe-member-access`, `typescript/no-unsafe-return` | Repository | None |
| Durable Object code follows [durable-object-http.md](durable-object-http.md): each object is an Effect HTTP API reached through `fetch`, never Alchemy RPC; an instance is keyed by its canonical race ID; and stubs and generated clients are built inside each invocation and stay private to the client. No Durable Object exists yet, so the conventions come before the code. | judgment | Multiplayer, when it starts | None |

The inherited Ultracite presets run with type information (`options: { typeAware: true }`), so every type-aware rule they turn on is enforced too, such as `typescript/strict-boolean-expressions` and `typescript/no-confusing-void-expression`. Every other rule they turn on is enforced in every file as well, such as `func-style` (functions are `const` arrow functions), `no-use-before-define`, `no-shadow`, `no-nested-ternary` and `promise/prefer-await-to-then`. Only the rules above are listed, because they state Rushline's own decisions.

The boundary rules below apply to two file lists, each defined once in `oxlint.config.ts`:

- `effectFiles`: the entries and `src/` folders of `tools/perf` and `tools/verify` (`tools/perf/*.ts`, `tools/perf/src/**/*.ts`, `tools/verify/*.ts`, `tools/verify/src/**/*.ts`), `packages/devtools/src/**/*.ts`, and the telemetry boundary: `apps/web/src/server/**/*.ts`, the route `apps/web/src/routes/api/telemetry.ts`, `packages/telemetry/src/**/*.ts`, the queue `apps/web/src/diagnostics/uploader.ts`, the browser entry `apps/web/src/diagnostics/uploader-runtime.ts` and `apps/web/src/diagnostics/upload/**/*.ts`; and the save codec, `save.ts` and the `save-*.ts` modules in `packages/career/src`, without their tests, the browser save: the entry `apps/web/src/career/save.ts`, `save-storage.ts` and `save-storage-error.ts`; and the asset loading: the entry `apps/web/src/asset-runtime.ts`, `apps/web/src/assets/load.ts` and its four error modules, `model-request-failed.ts`, `model-response-rejected.ts`, `model-decode-failed.ts` and `font-readiness-failed.ts`.
- `libraryFiles`: the same files without the entries. Only the entries run an Effect: `tools/perf/measure.ts`, `tools/perf/session.ts`, `tools/verify/rushline.ts`, the telemetry route, `uploader-runtime.ts`, the browser save entry `apps/web/src/career/save.ts`, which runs each storage step synchronously, and `asset-runtime.ts`.

The diagnostics hub, the recorder, React, `vite.config.ts`, the plain boot bridge `apps/web/src/asset-load.ts`, `apps/web/src/assets/model-urls.ts` and the game stay outside these lists. Tests live in each workspace's `test/` folder, outside them too, and every other rule in this file still applies to them. `scripts/telemetry-scopes.test.ts` checks which of these rules reach sample paths of each role. The rules match names and syntax. They do not follow types or data flow, so a review still checks what they cannot see, such as a service method whose Effect is dropped.

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| No `async` function, `Promise` or `PromiseLike` type, `.then`, `new Promise`, `Promise.*` call or top-level `await`, except inside an `Effect.promise` or `Effect.tryPromise` thunk. A Promise API is wrapped once with `Effect.tryPromise`. | `rushline/no-promise` | `effectFiles` | None |
| No import, re-export, `require` or dynamic import of `fs` or `child_process`, with or without `node:` and with any subpath. Files go through the `FileSystem` service and processes through `ChildProcessSpawner`. A detached child, such as the server or watcher `rv` starts, is spawned through `/bin/sh`, which appends its output to the log file and then `exec`s it, so the PID stays the child's. | `rushline/no-node-io` | `effectFiles` | None |
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
| Sequence dependent Effect steps, branches, loops and named intermediate results in a generator: a named `Effect.fn` for an exported operation or service method, `Effect.gen` for private construction. Use `.pipe` for one plain transformation and for policy around an operation: error translation, recovery, retry, timeout, tracing, a permit or scope, and providing services. [Sequencing and composition](#sequencing-and-composition) shows each case in Rushline's code. | judgment | `effectFiles` | None |

### Sequencing and composition

`ingest` in `apps/web/src/server/telemetry.ts` is a generator because each step needs an earlier result: it gets the store, reads the body, decodes it twice, reads the clock and saves. A `.pipe` on one yielded step translates that step's failure and stays local to it:

```ts
export const ingest = Effect.fn("telemetry.ingest")(function* ingest(
  request: Request
) {
  const store = yield* TelemetryStore;
  const text = yield* readBody(request);
  const value = yield* decodeJson(text).pipe(
    Effect.mapError((cause) => new NotJson({ cause }))
  );
  const batch = yield* decodeBatchEffect(value).pipe(
    Effect.mapError((cause) => new Invalid({ cause }))
  );
  const receivedAt = DateTime.formatIso(
    DateTime.makeUnsafe(yield* Clock.currentTimeMillis)
  );
  const saved = yield* store
    .save(batch, JSON.stringify({ batch, receivedAt }))
    .pipe(Effect.mapError((cause) => new StoreFailed({ cause })));
  const ack: Ack = {
    batchId: batch.batchId,
    duplicate: saved === "duplicate",
    sessionId: batch.session.sessionId,
  };
  return ack;
});
```

One transformation stays a pipe, as `pastDeadline` in `tools/perf/src/measure-page.ts` does:

```ts
const pastDeadline = (deadline: number) =>
  Clock.currentTimeMillis.pipe(Effect.map((now) => now > deadline));
```

Policy that wraps the whole operation goes after the generator, in `Effect.fn`'s combinator arguments, not in a wrapper function. `deliver` in `apps/web/src/diagnostics/upload/delivery.ts` branches on the status and checks the acknowledgement inside its generator, then passes `Effect.catchTag("UploadFailure", …)` to turn an `UploadFailure` from any step into a retry. `save` in `packages/telemetry/src/jsonl-store.ts` passes `(saving) => gate.withPermit(saving)` the same way. In the same file `jsonlStoreLayer` builds the service with a private `Effect.gen` inside `Layer.effect`; that is construction, not an operation.

When a chain of `map`, `flatMap` or `andThen` carries earlier results into later steps, write a generator so the dependencies show. A pipe that starts branching on outcomes or running further Effects belongs in the surrounding generator. Do not turn one clear transformation into a generator, and do not count combinators.

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
| After a change to what the game creates or releases, run `apps/web/test/renderer-lifecycle.ts` in an `rv up --dev` slot at `/kit?prof` with `rv js 'import("/test/renderer-lifecycle.ts").then((m) => m.run())'`. Its geometry, texture and program counts must return to their warmed values after each track change (A, B, A) and each quality change (lowest rung, top rung, lowest rung), with no upward trend, and three real `WEBGL_lose_context` cycles must end `lost` and then prepare `ready` again. A reload whose warm-up draw throws must still release the retired actors, and the retired world as well when the road changes. | judgment | `apps/web/test/renderer-lifecycle.ts` | None |
