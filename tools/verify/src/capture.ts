import path from "node:path";

import type { Session } from "@racer/devtools/cdp";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { heldFor } from "./page.ts";

const SCREENCAST_QUALITY = 70;

const SCREENCAST_WIDTH = 1512;

const SCREENCAST_HEIGHT = 860;

const captured = Schema.Struct({ data: Schema.String });

export const screenshot = Effect.fn("rv.screenshot")(function* screenshot(
  page: Session,
  file: string
) {
  const fs = yield* FileSystem.FileSystem;
  const { data } = yield* page.call(
    "Page.captureScreenshot",
    { format: "png" },
    captured
  );
  yield* fs.writeFile(file, Buffer.from(data, "base64"));
  return file;
});

const axValue = Schema.optionalKey(
  Schema.Struct({ value: Schema.optionalKey(Schema.Unknown) })
);

const axTree = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      childIds: Schema.optionalKey(Schema.Array(Schema.String)),
      ignored: Schema.Boolean,
      name: axValue,
      nodeId: Schema.String,
      properties: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            name: Schema.String,
            value: Schema.Struct({ value: Schema.optionalKey(Schema.Unknown) }),
          })
        )
      ),
      role: axValue,
      value: axValue,
    })
  ),
});

type AxNode = (typeof axTree.Type)["nodes"][number];

const isText = Schema.is(Schema.String);

const axText = (field: AxNode["role"]): string => {
  const value = field?.value;
  return isText(value) ? value : "";
};

const QUIET_ROLES = new Set([
  "generic",
  "none",
  "InlineTextBox",
  "LineBreak",
  "RootWebArea",
]);

const STATE_PROPERTIES = new Set([
  "disabled",
  "pressed",
  "focused",
  "selected",
  "valuenow",
  "modal",
]);

const describeNode = (node: AxNode): string => {
  const role = axText(node.role);
  const name = axText(node.name).trim();
  const flags = (node.properties ?? [])
    .filter(
      (each) =>
        STATE_PROPERTIES.has(each.name) &&
        each.value.value !== false &&
        each.value.value !== undefined
    )
    .map((each) =>
      each.value.value === true
        ? each.name
        : `${each.name}=${String(each.value.value)}`
    );
  return [role, name === "" ? "" : JSON.stringify(name), ...flags]
    .filter(Boolean)
    .join(" ");
};

export const ariaSnapshot = Effect.fn("rv.ariaSnapshot")(function* ariaSnapshot(
  page: Session,
  file: string
) {
  const fs = yield* FileSystem.FileSystem;
  yield* page.send("Accessibility.enable");
  const { nodes } = yield* page.call("Accessibility.getFullAXTree", {}, axTree);
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const lines: string[] = [];
  const walk = (node: AxNode, depth: number, named: string) => {
    const role = axText(node.role);
    const name = axText(node.name).trim();
    const repeated = role === "StaticText" && named.includes(name);
    const shown = !(node.ignored || QUIET_ROLES.has(role) || repeated);
    if (shown) {
      lines.push(`${"  ".repeat(depth)}${describeNode(node)}`);
    }
    for (const child of node.childIds ?? []) {
      const next = byId.get(child);
      if (next) {
        walk(next, shown ? depth + 1 : depth, name === "" ? named : name);
      }
    }
  };
  const [root] = nodes;
  if (root) {
    walk(root, 0, "");
  }
  yield* fs.writeFileString(file, `${lines.join("\n")}\n`);
  return lines.length;
});

const screencastFrame = Schema.Struct({
  data: Schema.String,
  metadata: Schema.Struct({ timestamp: Schema.optionalKey(Schema.Number) }),
  sessionId: Schema.Number,
});

interface Screencast {
  readonly frames: number;
  readonly seconds: number;
  readonly dir: string;
}

interface Frame {
  readonly data: string;
  readonly index: number;
  readonly sessionId: number;
}

export const screencast = Effect.fn("rv.screencast")(function* screencast(
  page: Session,
  dir: string,
  seconds: number,
  everyNth: number
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  const stamps: number[] = [];
  const frames = yield* Queue.make<Frame, Cause.Done>();
  yield* page.on("Page.screencastFrame", screencastFrame, (frame) => {
    const accepted = Queue.offerUnsafe(frames, {
      data: frame.data,
      index: stamps.length,
      sessionId: frame.sessionId,
    });
    if (accepted) {
      stamps.push(frame.metadata.timestamp ?? 0);
    }
  });
  const writer = yield* Effect.forkScoped(
    Stream.fromQueue(frames).pipe(
      Stream.runForEach((frame) =>
        Effect.all(
          [
            fs.writeFile(
              path.join(
                dir,
                `frame-${String(frame.index).padStart(4, "0")}.jpg`
              ),
              Buffer.from(frame.data, "base64")
            ),
            page.send("Page.screencastFrameAck", {
              sessionId: frame.sessionId,
            }),
          ],
          { concurrency: "unbounded", discard: true }
        )
      )
    )
  );
  yield* page.send("Page.enable");
  yield* heldFor(
    page.send("Page.startScreencast", {
      everyNthFrame: everyNth,
      format: "jpeg",
      maxHeight: SCREENCAST_HEIGHT,
      maxWidth: SCREENCAST_WIDTH,
      quality: SCREENCAST_QUALITY,
    }),
    seconds * 1000,
    page
      .send("Page.stopScreencast")
      .pipe(
        Effect.andThen(Queue.end(frames)),
        Effect.andThen(Fiber.join(writer))
      )
  );
  yield* fs.writeFileString(
    path.join(dir, "frames.json"),
    JSON.stringify({ everyNth, seconds, timestamps: stamps }, null, 1)
  );
  const cast: Screencast = { dir, frames: stamps.length, seconds };
  return cast;
});
