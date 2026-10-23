import { evaluate } from "@racer/devtools/cdp";
import { ToolProcesses, alive } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { Evidence, isError } from "./evidence.ts";
import { git, newestSourceChange, serverAnswers } from "./instance.ts";
import { withPage } from "./page.ts";

const pageFacts = Schema.Struct({
  gl: Schema.String,
  href: Schema.String,
  profiled: Schema.Boolean,
  title: Schema.String,
  visibility: Schema.String,
});

const failed = Effect.sync(() => {
  process.exitCode = 1;
});

export const doctor = Effect.fn("rv.doctor")(function* doctor(
  context: CommandContext
) {
  const { print } = context;
  const state = yield* requireRun(context);
  const processes = yield* ToolProcesses;
  const evidence = yield* Evidence;
  const results: boolean[] = [];
  const check = (ok: boolean, label: string, detail: string) =>
    Effect.map(print(`${ok ? "ok  " : "FAIL"} ${label}: ${detail}`), () => {
      results.push(ok);
    });
  const owned = state.serverMode !== "external";
  const serverPort = Number(new URL(state.serverUrl).port);
  const serverListener = yield* processes.listenerOf(serverPort);
  yield* check(
    owned ? serverListener === state.serverPid : serverListener !== null,
    "server process",
    `${state.serverMode} on ${serverPort}, listener pid ${serverListener}, recorded ${state.serverPid ?? "external"}`
  );
  yield* check(
    yield* serverAnswers(state.serverUrl),
    "server answers",
    state.serverUrl
  );
  if (state.serverMode === "preview" && state.builtAt !== null) {
    const head = yield* git(state.checkout, ["rev-parse", "--short", "HEAD"]);
    const changed = yield* newestSourceChange(state.checkout);
    yield* check(
      changed <= state.builtAt && state.builtFrom?.startsWith(head) === true,
      "build is current",
      `built from ${state.builtFrom} at ${new Date(state.builtAt).toISOString()}; HEAD ${head}; newest source edit ${new Date(changed).toISOString()}${changed > state.builtAt ? " (after the build: run rv rebuild)" : ""}`
    );
  }
  const browserListener = yield* processes.listenerOf(state.devtoolsPort);
  yield* check(
    browserListener !== null && browserListener === state.browserPid,
    "helium process",
    `devtools ${state.devtoolsPort}, listener pid ${browserListener}, recorded ${state.browserPid}`
  );
  yield* check(
    alive(state.watcherPid),
    "console watcher",
    `pid ${state.watcherPid}, cpu x${state.cpu}, network ${state.network}`
  );
  if (browserListener === null) {
    yield* failed;
    return;
  }
  const facts = yield* withPage(state, (page) =>
    evaluate(
      page,
      `(() => { const gl = document.createElement("canvas").getContext("webgl2"); const info = gl && gl.getExtension("WEBGL_debug_renderer_info"); return { gl: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : "no WebGL 2", href: location.href, profiled: Boolean(globalThis.__rushlineProfile), title: document.title, visibility: document.visibilityState }; })()`,
      pageFacts
    )
  );
  yield* check(
    facts.href.startsWith(new URL(state.serverUrl).origin),
    "page",
    `${facts.title} at ${facts.href}${facts.profiled ? ", frame recorder on" : ""}`
  );
  yield* check(
    facts.visibility === "visible",
    "page visible",
    `${facts.visibility}; a hidden page pauses the race and stops frames`
  );
  yield* check(
    facts.gl.includes("Metal") && !facts.gl.includes("SwiftShader"),
    "gpu",
    facts.gl
  );
  const errors = (yield* evidence.readConsole(state)).filter(isError);
  yield* check(
    errors.length === 0,
    "console errors",
    errors.length === 0
      ? "none"
      : `${errors.length}; last: ${errors.at(-1)?.text.slice(0, 200)}`
  );
  if (results.includes(false)) {
    yield* failed;
  }
});
