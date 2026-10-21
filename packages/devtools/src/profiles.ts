import * as Schema from "effect/Schema";

import { loadMap, originalOf } from "./source-maps.ts";

const CallFrame = Schema.Struct({
  columnNumber: Schema.Number,
  functionName: Schema.String,
  lineNumber: Schema.Number,
  url: Schema.String,
});

export const cpuProfile = Schema.Struct({
  profile: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({ callFrame: CallFrame, id: Schema.Number })
    ),
    samples: Schema.Array(Schema.Number),
    timeDeltas: Schema.Array(Schema.Number),
  }),
});

export type CpuProfile = typeof cpuProfile.Type;

interface HotFunction {
  readonly selfMs: number;
  readonly share: number;
  readonly name: string;
  readonly where: string;
}

const IDLE = new Set(["(idle)", "(program)", "(root)"]);

export interface Hotspots {
  readonly busyMs: number;
  readonly idleMs: number;
  readonly programMs: number;
  readonly top: HotFunction[];
}

export const hottest = async (
  profile: CpuProfile,
  limit: number
): Promise<Hotspots> => {
  const byNode = new Map(profile.profile.nodes.map((node) => [node.id, node]));
  const selfByKey = new Map<string, number>();
  const frameByKey = new Map<string, typeof CallFrame.Type>();
  const special = new Map<string, number>();
  for (const [index, sample] of profile.profile.samples.entries()) {
    const node = byNode.get(sample);
    if (!node) {
      continue;
    }
    if (IDLE.has(node.callFrame.functionName)) {
      const { functionName } = node.callFrame;
      const micros = profile.profile.timeDeltas[index] ?? 0;
      special.set(
        functionName,
        (special.get(functionName) ?? 0) + micros / 1000
      );
      continue;
    }
    const { functionName, url, lineNumber, columnNumber } = node.callFrame;
    const key = `${functionName}|${url}|${lineNumber}|${columnNumber}`;
    const micros = profile.profile.timeDeltas[index] ?? 0;
    selfByKey.set(key, (selfByKey.get(key) ?? 0) + micros / 1000);
    frameByKey.set(key, node.callFrame);
  }
  const busyMs = [...selfByKey.values()].reduce((sum, each) => sum + each, 0);
  const ranked = [...selfByKey.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit);
  const urls = new Set(
    ranked.map(([key]) => frameByKey.get(key)?.url ?? "").filter(Boolean)
  );
  const maps = new Map(
    await Promise.all(
      [...urls].map(async (url) => [url, await loadMap(url)] as const)
    )
  );
  const top = ranked.map(([key, selfMs]) => {
    const frame = frameByKey.get(key);
    const loaded = frame ? maps.get(frame.url) : undefined;
    const original =
      frame && loaded
        ? originalOf(loaded, frame.lineNumber, frame.columnNumber)
        : null;
    const file = frame?.url.split("/").at(-1) ?? "";
    return {
      name:
        frame === undefined || frame.functionName === ""
          ? "(anonymous)"
          : frame.functionName,
      selfMs,
      share: busyMs > 0 ? selfMs / busyMs : 0,
      where: original ?? `${file}:${(frame?.lineNumber ?? 0) + 1}`,
    };
  });
  return {
    busyMs,
    idleMs: special.get("(idle)") ?? 0,
    programMs: special.get("(program)") ?? 0,
    top,
  };
};

interface AllocationNode {
  readonly callFrame: typeof CallFrame.Type;
  readonly selfSize: number;
  readonly children: readonly AllocationNode[];
}

const allocationNode = Schema.Struct({
  callFrame: CallFrame,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<AllocationNode> => allocationNode)
  ),
  selfSize: Schema.Number,
});

export const allocationProfile = Schema.Struct({
  profile: Schema.Struct({ head: allocationNode }),
});

export type AllocationProfile = typeof allocationProfile.Type;

interface AllocationSite {
  readonly bytes: number;
  readonly share: number;
  readonly name: string;
  readonly where: string;
}

export interface Allocations {
  readonly bytes: number;
  readonly top: readonly AllocationSite[];
}

interface SiteTotal {
  bytes: number;
  readonly frame: typeof CallFrame.Type;
}

const gatherAllocations = (
  node: AllocationNode,
  caller: typeof CallFrame.Type,
  into: Map<string, SiteTotal>
): void => {
  const builtin = node.callFrame.url === "";
  const frame = builtin
    ? {
        ...caller,
        functionName: `${node.callFrame.functionName} in ${caller.functionName || "(anonymous)"}`,
      }
    : node.callFrame;
  if (node.selfSize > 0) {
    const { functionName, url, lineNumber, columnNumber } = frame;
    const key = `${functionName}|${url}|${lineNumber}|${columnNumber}`;
    const site = into.get(key);
    if (site) {
      site.bytes += node.selfSize;
    } else {
      into.set(key, { bytes: node.selfSize, frame });
    }
  }
  for (const child of node.children) {
    gatherAllocations(child, builtin ? caller : node.callFrame, into);
  }
};

export const allocationSites = async (
  profile: AllocationProfile,
  limit: number
): Promise<Allocations> => {
  const sites = new Map<string, SiteTotal>();
  gatherAllocations(
    profile.profile.head,
    profile.profile.head.callFrame,
    sites
  );
  const bytes = [...sites.values()].reduce((sum, each) => sum + each.bytes, 0);
  const ranked = [...sites.values()]
    .toSorted((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
  const urls = new Set(ranked.map(({ frame }) => frame.url).filter(Boolean));
  const maps = new Map(
    await Promise.all(
      [...urls].map(async (url) => [url, await loadMap(url)] as const)
    )
  );
  return {
    bytes,
    top: ranked.map((site) => {
      const { frame } = site;
      const loaded = maps.get(frame.url);
      const original = loaded
        ? originalOf(loaded, frame.lineNumber, frame.columnNumber)
        : null;
      return {
        bytes: site.bytes,
        name: frame.functionName || "(anonymous)",
        share: bytes > 0 ? site.bytes / bytes : 0,
        where:
          original ??
          `${frame.url.split("/").at(-1) ?? ""}:${frame.lineNumber + 1}`,
      };
    }),
  };
};
