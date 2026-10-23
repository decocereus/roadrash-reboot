import { noEffectRuntimeRule } from "../rushline/rules/no-effect-runtime.ts";
import { noNodeIoRule } from "../rushline/rules/no-node-io.ts";
import { noPromiseRule } from "../rushline/rules/no-promise.ts";
import { runRule } from "./cases.ts";

const runtime = [{ messageId: "runtime" }];
const runtimeModule = [{ messageId: "runtimeModule" }];
const promise = [{ messageId: "promise" }];
const nodeIo = [{ messageId: "nodeIo" }];

runRule("rushline/no-effect-runtime", noEffectRuntimeRule, {
  invalid: [
    { code: "Effect.runPromise(program);", errors: runtime },
    { code: "Effect.runSync(program);", errors: runtime },
    { code: "Effect.runFork(program);", errors: runtime },
    {
      code: "import { runPromise as go } from 'effect/Effect'; go(program);",
      errors: runtime,
    },
    {
      code: "import * as E from 'effect/Effect'; E.runPromiseExit(program);",
      errors: runtime,
    },
    { code: "const { runPromise } = Effect;", errors: runtime },
    { code: "Effect['runSync'](program);", errors: runtime },
    { code: "import { ManagedRuntime } from 'effect';", errors: runtime },
    {
      code: "import * as Managed from 'effect/ManagedRuntime';",
      errors: runtimeModule,
    },
    { code: "runtime.runPromise(program);", errors: runtime },
    {
      code: "import * as Fx from 'effect'; Fx.ManagedRuntime.make(layer);",
      errors: runtime,
    },
    {
      code: "export { runPromise } from 'effect/Effect';",
      errors: runtime,
    },
    { code: "export * from 'effect/Effect';", errors: runtimeModule },
    {
      code: "const view = <div>{Effect.runSync(program)}</div>;",
      errors: runtime,
      filename: "view.tsx",
    },
    {
      code: "import * as NodeRuntime from '@effect/platform-node/NodeRuntime';",
      errors: runtimeModule,
    },
    {
      code: "import { NodeRuntime } from '@effect/platform-node';",
      errors: runtime,
    },
    {
      code: "import { runMain } from '@effect/platform-node/NodeRuntime';",
      errors: runtimeModule,
    },
    {
      code: "export * from '@effect/platform-node/NodeRuntime';",
      errors: runtimeModule,
    },
    { code: "NodeRuntime.runMain(program);", errors: runtime },
    { code: "const { runMain } = NodeRuntime;", errors: runtime },
    { code: "runtime['runMain'](program);", errors: runtime },
  ],
  valid: [
    "import * as Effect from 'effect/Effect'; Effect.gen(function* () {});",
    "Stream.runForEach(stream, handle);",
    "Stream.runCollect(stream);",
    "import { runPromise } from './local.ts';",
    "export { gen } from 'effect/Effect';",
    "import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';",
    "import { layer } from '@effect/platform-node/NodePath';",
    "import { runCommand } from '@racer/devtools/cleanup';",
    "export const main = (script) => runCommand(script);",
  ],
});

runRule("rushline/no-promise", noPromiseRule, {
  invalid: [
    { code: "async function load() {}", errors: promise },
    { code: "const service = { async load() {} };", errors: promise },
    { code: "const load = async (id) => id;", errors: promise },
    { code: "const load = async id => id;", errors: promise },
    { code: "const read = (): Promise<string> => value;", errors: promise },
    { code: "const read: PromiseLike<number> = value;", errors: promise },
    { code: "value.then(handle);", errors: promise },
    { code: "value['then'](handle);", errors: promise },
    {
      code: "const ready = new Promise((resolve) => resolve(1));",
      errors: promise,
    },
    { code: "Promise.all([a, b]);", errors: promise },
    { code: "await load();", errors: promise },
    {
      code: "Effect.tryPromise({ catch: () => (async () => 1)(), try: () => fetch(url) });",
      errors: promise,
    },
    {
      code: "Effect.sync(() => fetch(url).then(read));",
      errors: promise,
    },
  ],
  valid: [
    "Effect.tryPromise({ catch: () => failure, try: () => fetch(url).then((r) => r.json()) });",
    "Effect.tryPromise(() => Promise.all([a, b]));",
    "Effect.promise(async () => { await ready; });",
    "Effect.gen(function* () { yield* Effect.sleep('1 second'); });",
    "Effect.catch(program, recover);",
  ],
});

runRule("rushline/no-node-io", noNodeIoRule, {
  invalid: [
    { code: "import fs from 'fs';", errors: nodeIo },
    { code: "import { readFile } from 'node:fs/promises';", errors: nodeIo },
    { code: "import { spawn } from 'child_process';", errors: nodeIo },
    { code: "const fs = require('fs');", errors: nodeIo },
    { code: "const fs = import('node:fs');", errors: nodeIo },
    { code: "export * from 'node:child_process';", errors: nodeIo },
    { code: "export { readFile } from 'fs/promises';", errors: nodeIo },
    { code: "import fs = require('fs');", errors: nodeIo },
  ],
  valid: [
    "import { readFile } from './fs.ts';",
    "import watcher from 'fsevents';",
    "import path from 'node:path';",
    "import * as FileSystem from 'effect/FileSystem';",
  ],
});
