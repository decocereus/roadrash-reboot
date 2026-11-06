# Effect standards

Rules for the files inside the Effect boundary: the race room's Worker, the server, telemetry, the tools, the save and asset codecs. The core rules in [coding-standards.md](../coding-standards.md) apply too, including where Effect runs at all.

## Use Effect only at the edges

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| A local perf verdict or baseline needs the machine to itself, because timing rows fail on load alone. `pnpm perf` queues on the machine's bench queue through `queueForBench` in `@racer/devtools/bench-turn`, waits for the load to fall to three quarters of the logical CPUs through `settledLoad` in `tools/perf/src/load.ts`, and ends in `NO VERDICT` with exit code 3 if the load stays high, peaks over the limit, or the calibration drifts during the timed runs. | `pnpm test` | `tools/perf` | None |
| A wait that polls the page until a deadline stops at that deadline even when the page never answers a call, as a hung or crashed tab does. It runs its whole poll, calls and sleeps, under `byDeadline` from `@racer/devtools/deadline`, which interrupts the outstanding call when the time left runs out and fails with the tool's own error, `VerificationError` in `rv` and `BrowserError` in the perf bench. A deadline compared only between calls never fires while a call is pending. | `pnpm test` | `tools/verify/src/page.ts`, `tools/perf/src/measure-page.ts`, `tools/verify/test/wait-deadline.test.ts`, `tools/perf/test/measure-page.test.ts` | None |
| Look up an Effect API in the installed source first: `node_modules/effect/src` and the package's `exports`, then `node_modules/@effect/platform-node/src`, then Alchemy's own source, such as `alchemy/src/Runtime.ts`, for what its wrappers do. Use the pinned Effect checkout only when you need code or tests that the package does not ship. `pnpm effect:reference` creates it at `.references/effect`, at commit `67ba4e46a11ccda0b6761578bfd22c04ae00167d`, which is Effect 4.0.0, the version the root `package.json` pins. On every run it checks that the installed Effect matches the root pin, that `.references/effect` is ignored and untracked, and that an existing checkout is clean, at that commit and at that version. It never fetches into, resets or cleans an existing checkout: a mismatch is an error that leaves the checkout as it is. It is not part of `pnpm check`, the build or CI, and it uses the network only when the checkout is missing. Do not copy API examples from the Effect website, which may describe another version. | `pnpm effect:reference` | Development setup | None |
| Durable Object code follows [durable-object-http.md](../durable-object-http.md): each object is an Effect HTTP API reached through `fetch`, never Alchemy RPC; an instance is keyed by its canonical race ID; and stubs and generated clients are built inside each invocation and stay private to the client. | judgment | `apps/rooms` | None |

The boundary rules below apply to two file lists, each defined once in `oxlint.config.ts`:

- `effectFiles`: the entries and `src/` folders of `tools/art`, `tools/perf`, `tools/rooms`, `tools/verify`, `tools/madrid` and `tools/road-test` (`tools/art/*.ts`, `tools/art/src/**/*.ts`, `tools/perf/*.ts`, `tools/perf/src/**/*.ts`, `tools/rooms/*.ts`, `tools/rooms/src/**/*.ts`, `tools/verify/*.ts`, `tools/verify/src/**/*.ts`, `tools/madrid/*.ts`, `tools/madrid/src/**/*.ts`, `tools/road-test/*.ts`, `tools/road-test/src/**/*.ts`), `packages/devtools/src/**/*.ts`, the race room's Worker `apps/rooms/src/**/*.ts`, and the telemetry boundary: `apps/web/src/server/**/*.ts`, the route `apps/web/src/routes/api/telemetry.ts`, `packages/telemetry/src/**/*.ts`, the queue `apps/web/src/diagnostics/uploader.ts`, the browser entry `apps/web/src/diagnostics/uploader-runtime.ts` and `apps/web/src/diagnostics/upload/**/*.ts`; the Madrid corridor codec, `packages/track/src/madrid-schema.ts` and `madrid-corridor.ts`; and the save codec, `save.ts`, the `save-*.ts` modules and `rules-schema.ts` in `packages/career/src`, without their tests, the browser save: the entry `apps/web/src/career/save.ts`, `save-storage.ts` and `save-storage-error.ts`; and the asset loading: the entry `apps/web/src/asset-runtime.ts`, `apps/web/src/assets/load.ts` and its four error modules, `model-request-failed.ts`, `model-response-rejected.ts`, `model-decode-failed.ts` and `font-readiness-failed.ts`; and the race rules: the entry `apps/web/src/rules/load.ts` and its three error modules, `rules-request-failed.ts`, `rules-response-rejected.ts` and `rules-decode-failed.ts`.
- `libraryFiles`: the same files without the entries. Only the entries run an Effect: every `.ts` file directly under `tools/art`, `tools/perf`, `tools/rooms`, `tools/verify`, `tools/madrid` and `tools/road-test`, outside their `src/` folders, the telemetry route, `uploader-runtime.ts`, the browser save entry `apps/web/src/career/save.ts`, which runs each storage step synchronously, `asset-runtime.ts`, and the race rules loader `apps/web/src/rules/load.ts`.

The diagnostics hub, the recorder, React, `vite.config.ts`, the plain boot bridge `apps/web/src/asset-load.ts`, `apps/web/src/assets/model-urls.ts` and the game stay outside these lists. Tests live in each workspace's `test/` folder, outside them too, and every other rule in these standards still applies to them. `scripts/telemetry-scopes.test.ts` checks which of these rules reach sample paths of each role. The rules match names and syntax. They do not follow types or data flow, so a review still checks what they cannot see, such as a service method whose Effect is dropped.

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

One transformation stays a pipe, as `deadline` in `tools/verify/src/context.ts` does:

```ts
const deadline = Clock.currentTimeMillis.pipe(
  Effect.map((now) => now + Number(values.timeout) * 1000)
);
```

Policy that wraps the whole operation goes after the generator, in `Effect.fn`'s combinator arguments, not in a wrapper function. `deliver` in `apps/web/src/diagnostics/upload/delivery.ts` branches on the status and checks the acknowledgement inside its generator, then passes `Effect.catchTag("UploadFailure", …)` to turn an `UploadFailure` from any step into a retry. `save` in `packages/telemetry/src/jsonl-store.ts` passes `(saving) => gate.withPermit(saving)` the same way. In the same file `jsonlStoreLayer` builds the service with a private `Effect.gen` inside `Layer.effect`; that is construction, not an operation.

When a chain of `map`, `flatMap` or `andThen` carries earlier results into later steps, write a generator so the dependencies show. A pipe that starts branching on outcomes or running further Effects belongs in the surrounding generator. Do not turn one clear transformation into a generator, and do not count combinators.
