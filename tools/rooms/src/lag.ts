import net from "node:net";
import type { Socket } from "node:net";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

const usage =
  "Usage: pnpm rooms:lag --listen <port> --target <port> [--rtt 100] [--jitter 20] [--loss 1] [--burst-every 10] [--burst-ms 1000] [--upload-ms 150 --upload-after 30]";

const RETRANSMIT_EXTRA_MS = 50;

interface Link {
  readonly burstEveryMs: number;
  readonly burstMs: number;
  readonly jitterMs: number;
  readonly lossShare: number;
  readonly rttMs: number;
  readonly uploadAfterMs: number;
  readonly uploadMs: number;
}

const options = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          "burst-every": { default: "0", type: "string" },
          "burst-ms": { default: "0", type: "string" },
          jitter: { default: "20", type: "string" },
          listen: { type: "string" },
          loss: { default: "1", type: "string" },
          rtt: { default: "100", type: "string" },
          target: { type: "string" },
          "upload-after": { default: "0", type: "string" },
          "upload-ms": { default: "0", type: "string" },
        },
      }).values,
  });

const delayOf = ({ jitterMs, lossShare, rttMs }: Link): number => {
  const oneWay = rttMs / 2 + (Math.random() - 0.5) * jitterMs;
  const lost = Math.random() < lossShare;
  return oneWay + (lost ? rttMs + RETRANSMIT_EXTRA_MS : 0);
};

const burstEndsAt = ({ burstEveryMs, burstMs }: Link, now: number): number => {
  if (burstEveryMs <= 0) {
    return now;
  }
  const into = now % burstEveryMs;
  return into < burstMs ? now - into + burstMs : now;
};

const delayedWrites = (
  to: Socket,
  link: Link,
  slowerMs: (now: number) => number
) => {
  const queue: { readonly at: number; readonly data: Buffer | null }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAt = 0;
  const drain = (): void => {
    timer = null;
    const now = performance.now();
    let [next] = queue;
    while (next && next.at <= now) {
      queue.shift();
      if (next.data === null) {
        to.end();
      } else if (!to.destroyed) {
        to.write(next.data);
      }
      [next] = queue;
    }
    if (next) {
      timer = setTimeout(drain, Math.max(0, next.at - now));
    }
  };
  return (data: Buffer | null): void => {
    const now = performance.now();
    lastAt = Math.max(
      lastAt,
      burstEndsAt(link, now) + delayOf(link) + slowerMs(now)
    );
    queue.push({ at: lastAt, data });
    timer ??= setTimeout(drain, Math.max(0, lastAt - performance.now()));
  };
};

const NOT_SLOWER = (): number => 0;

const bridge = (
  client: Socket,
  targetPort: number,
  link: Link,
  uploadSlowerMs: (now: number) => number
): void => {
  const upstream = net.connect(targetPort, "127.0.0.1");
  client.setNoDelay(true);
  upstream.setNoDelay(true);
  const toUpstream = delayedWrites(upstream, link, uploadSlowerMs);
  const toClient = delayedWrites(client, link, NOT_SLOWER);
  client.on("data", toUpstream);
  upstream.on("data", toClient);
  client.on("end", () => {
    toUpstream(null);
  });
  upstream.on("end", () => {
    toClient(null);
  });
  client.on("error", () => {
    upstream.destroy();
  });
  upstream.on("error", () => {
    client.destroy();
  });
};

export const main = Effect.fn("rooms.lag")(function* main(
  args: readonly string[]
) {
  const values = yield* options(args);
  const { listen, target } = values;
  if (listen === undefined || target === undefined) {
    return yield* new UsageError({ message: usage });
  }
  const link: Link = {
    burstEveryMs: Number(values["burst-every"]) * 1000,
    burstMs: Number(values["burst-ms"]),
    jitterMs: Number(values.jitter),
    lossShare: Number(values.loss) / 100,
    rttMs: Number(values.rtt),
    uploadAfterMs: Number(values["upload-after"]) * 1000,
    uploadMs: Number(values["upload-ms"]),
  };
  const startedAt = performance.now();
  const uploadSlowerMs = (now: number): number =>
    now - startedAt >= link.uploadAfterMs ? link.uploadMs : 0;
  const server = net.createServer((client) => {
    bridge(client, Number(target), link, uploadSlowerMs);
  });
  server.listen(Number(listen), "127.0.0.1");
  yield* Console.log(
    `Port ${listen} reaches ${target} with ${link.rttMs} ms round trip, ${link.jitterMs} ms jitter and ${values.loss}% loss. Press Ctrl-C to stop.`
  );
  return yield* Effect.never;
});
