import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { Session } from "@racer/devtools/cdp";
import * as Schema from "effect/Schema";

const SCREENCAST_QUALITY = 70;

const SCREENCAST_WIDTH = 1512;

const SCREENCAST_HEIGHT = 860;

const captured = Schema.Struct({ data: Schema.String });

export const screenshot = async (
  page: Session,
  file: string
): Promise<string> => {
  const { data } = await page.call(
    "Page.captureScreenshot",
    { format: "png" },
    captured
  );
  await writeFile(file, data, { encoding: "base64" });
  return file;
};

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

export const ariaSnapshot = async (
  page: Session,
  file: string
): Promise<number> => {
  await page.send("Accessibility.enable");
  const { nodes } = await page.call("Accessibility.getFullAXTree", {}, axTree);
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
  await writeFile(file, `${lines.join("\n")}\n`);
  return lines.length;
};

const screencastFrame = Schema.Struct({
  data: Schema.String,
  metadata: Schema.Struct({ timestamp: Schema.optionalKey(Schema.Number) }),
  sessionId: Schema.Number,
});

export interface Screencast {
  readonly frames: number;
  readonly seconds: number;
  readonly dir: string;
}

export const screencast = async (
  page: Session,
  dir: string,
  seconds: number,
  everyNth: number
): Promise<Screencast> => {
  await mkdir(dir, { recursive: true });
  const writes: Promise<void>[] = [];
  const stamps: number[] = [];
  page.on("Page.screencastFrame", screencastFrame, (frame) => {
    const index = stamps.length;
    stamps.push(frame.metadata.timestamp ?? 0);
    writes.push(
      writeFile(
        path.join(dir, `frame-${String(index).padStart(4, "0")}.jpg`),
        frame.data,
        { encoding: "base64" }
      )
    );
    void page.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await page.send("Page.enable");
  await page.send("Page.startScreencast", {
    everyNthFrame: everyNth,
    format: "jpeg",
    maxHeight: SCREENCAST_HEIGHT,
    maxWidth: SCREENCAST_WIDTH,
    quality: SCREENCAST_QUALITY,
  });
  await sleep(seconds * 1000);
  await page.send("Page.stopScreencast");
  await Promise.all(writes);
  await writeFile(
    path.join(dir, "frames.json"),
    JSON.stringify({ everyNth, seconds, timestamps: stamps }, null, 1)
  );
  return { dir, frames: stamps.length, seconds };
};
