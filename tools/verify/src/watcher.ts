import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { connect } from "@racer/devtools/cdp";
import { pageTarget } from "@racer/devtools/chrome";
import * as Schema from "effect/Schema";

import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { startWatcher } from "./instance.ts";
import { throttle } from "./profile.ts";
import { writeState } from "./state.ts";
import type { InstanceState } from "./state.ts";

const WATCH_ATTEMPTS = 100;

const WATCH_POLL_MS = 100;

const consoleCall = Schema.Struct({
  args: Schema.Array(
    Schema.Struct({
      description: Schema.optionalKey(Schema.String),
      value: Schema.optionalKey(Schema.Unknown),
    })
  ),
  type: Schema.String,
});

const thrown = Schema.Struct({
  exceptionDetails: Schema.Struct({
    exception: Schema.optionalKey(
      Schema.Struct({ description: Schema.optionalKey(Schema.String) })
    ),
    text: Schema.String,
    url: Schema.optionalKey(Schema.String),
  }),
});

const logEntry = Schema.Struct({
  entry: Schema.Struct({
    level: Schema.String,
    source: Schema.String,
    text: Schema.String,
    url: Schema.optionalKey(Schema.String),
  }),
});

const navigated = Schema.Struct({
  frame: Schema.Struct({
    parentId: Schema.optionalKey(Schema.String),
    url: Schema.String,
  }),
});

export const watch = async (context: CommandContext) => {
  const state = await requireRun(context);
  const socket = await pageTarget(state.devtoolsPort, "http");
  if (socket === undefined || socket === "") {
    throw new Error("The watcher found no page to attach to.");
  }
  const page = await connect(socket);
  const out = createWriteStream(path.join(state.evidence, "console.jsonl"), {
    flags: "a",
  });
  const write = (kind: string, level: string, text: string) => {
    out.write(
      `${JSON.stringify({ at: new Date().toISOString(), kind, level, text })}\n`
    );
  };
  page.on("Runtime.consoleAPICalled", consoleCall, (call) => {
    write(
      "console",
      call.type,
      call.args
        .map((each) =>
          each.value === undefined
            ? (each.description ?? "")
            : JSON.stringify(each.value)
        )
        .join(" ")
    );
  });
  page.on("Runtime.exceptionThrown", thrown, ({ exceptionDetails }) => {
    write(
      "exception",
      "error",
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  });
  page.on("Log.entryAdded", logEntry, ({ entry }) => {
    write(
      `log:${entry.source}`,
      entry.level,
      `${entry.text}${entry.url !== undefined && entry.url !== "" ? ` (${entry.url})` : ""}`
    );
  });
  page.on("Page.frameNavigated", navigated, ({ frame }) => {
    if (frame.parentId === undefined) {
      write("navigate", "info", frame.url);
    }
  });
  await page.send("Page.enable");
  await page.send("Log.enable");
  await page.send("Runtime.enable");
  await throttle(page, state.cpu, state.network);
  write(
    "watch",
    "info",
    `attached; cpu x${state.cpu}; network ${state.network}`
  );
};

const watcherAttached = async (
  state: InstanceState,
  attempt: number
): Promise<boolean> => {
  const text = await readFile(
    path.join(state.evidence, "console.jsonl"),
    "utf-8"
  ).catch(() => "");
  if (text.includes(`attached; cpu x${state.cpu}; network ${state.network}`)) {
    return true;
  }
  if (attempt >= WATCH_ATTEMPTS) {
    return false;
  }
  await sleep(WATCH_POLL_MS);
  return await watcherAttached(state, attempt + 1);
};

export const launchWatcher = async (
  state: InstanceState,
  script: string
): Promise<InstanceState> => {
  const next = await startWatcher(state, script);
  await writeState(next);
  if (!(await watcherAttached(next, 0))) {
    throw new Error(
      `The console watcher did not attach; read ${path.join(state.evidence, "watch.log")}.`
    );
  }
  return next;
};
