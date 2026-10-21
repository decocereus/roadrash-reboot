import { evaluate } from "@racer/devtools/cdp";
import { alive, listenerOf } from "@racer/devtools/process";
import * as Schema from "effect/Schema";

import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { isError, readConsole } from "./evidence.ts";
import { git, newestSourceChange, serverAnswers } from "./instance.ts";
import { withPage } from "./page.ts";

const check = (
  print: (line: string) => void,
  ok: boolean,
  label: string,
  detail: string
): boolean => {
  print(`${ok ? "ok  " : "FAIL"} ${label}: ${detail}`);
  return ok;
};

const pageFacts = Schema.Struct({
  gl: Schema.String,
  href: Schema.String,
  profiled: Schema.Boolean,
  title: Schema.String,
  visibility: Schema.String,
});

export const doctor = async (context: CommandContext) => {
  const { print } = context;
  const state = await requireRun(context);
  const results: boolean[] = [];
  const owned = state.serverMode !== "external";
  const serverPort = Number(new URL(state.serverUrl).port);
  const serverListener = await listenerOf(serverPort);
  results.push(
    check(
      print,
      owned ? serverListener === state.serverPid : serverListener !== null,
      "server process",
      `${state.serverMode} on ${serverPort}, listener pid ${serverListener}, recorded ${state.serverPid ?? "external"}`
    ),
    check(
      print,
      await serverAnswers(state.serverUrl),
      "server answers",
      state.serverUrl
    )
  );
  if (state.serverMode === "preview" && state.builtAt !== null) {
    const head = await git(state.checkout, ["rev-parse", "--short", "HEAD"]);
    const changed = await newestSourceChange(state.checkout);
    results.push(
      check(
        print,
        changed <= state.builtAt && state.builtFrom?.startsWith(head) === true,
        "build is current",
        `built from ${state.builtFrom} at ${new Date(state.builtAt).toISOString()}; HEAD ${head}; newest source edit ${new Date(changed).toISOString()}${changed > state.builtAt ? " (after the build: run rv rebuild)" : ""}`
      )
    );
  }
  const browserListener = await listenerOf(state.devtoolsPort);
  results.push(
    check(
      print,
      browserListener !== null && browserListener === state.browserPid,
      "helium process",
      `devtools ${state.devtoolsPort}, listener pid ${browserListener}, recorded ${state.browserPid}`
    ),
    check(
      print,
      alive(state.watcherPid),
      "console watcher",
      `pid ${state.watcherPid}, cpu x${state.cpu}, network ${state.network}`
    )
  );
  if (browserListener === null) {
    process.exitCode = 1;
    return;
  }
  const facts = await withPage(
    state,
    async (page) =>
      await evaluate(
        page,
        `(() => { const gl = document.createElement("canvas").getContext("webgl2"); const info = gl && gl.getExtension("WEBGL_debug_renderer_info"); return { gl: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : "no WebGL 2", href: location.href, profiled: Boolean(globalThis.__rushlineProfile), title: document.title, visibility: document.visibilityState }; })()`,
        pageFacts
      )
  );
  results.push(
    check(
      print,
      facts.href.startsWith(new URL(state.serverUrl).origin),
      "page",
      `${facts.title} at ${facts.href}${facts.profiled ? ", frame recorder on" : ""}`
    ),
    check(
      print,
      facts.visibility === "visible",
      "page visible",
      `${facts.visibility}; a hidden page pauses the race and stops frames`
    ),
    check(
      print,
      facts.gl.includes("Metal") && !facts.gl.includes("SwiftShader"),
      "gpu",
      facts.gl
    )
  );
  const lines = await readConsole(state);
  const errors = lines.filter(isError);
  results.push(
    check(
      print,
      errors.length === 0,
      "console errors",
      errors.length === 0
        ? "none"
        : `${errors.length}; last: ${errors.at(-1)?.text.slice(0, 200)}`
    )
  );
  if (results.includes(false)) {
    process.exitCode = 1;
  }
};
