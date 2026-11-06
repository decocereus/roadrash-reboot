import net from "node:net";
import type { Socket } from "node:net";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

const usage =
  "Usage: pnpm rooms:lag --listen <port> --target <port> [--rtt 100] [--jitter 20] [--loss 1] [--burst-every 10] [--burst-ms 1000] [--upload-ms 150 --upload-after 30]";

const RETRANSMIT_EXTRA_MS = 50;

export interface Link {
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

interface Lane {
  readonly send: (to: Socket, data: Buffer | null) => void;
}

const laneOf = (link: Link, slowerMs: (now: number) => number): Lane => {
  const queue: {
    readonly at: number;
    readonly data: Buffer | null;
    readonly to: Socket;
  }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAt = 0;
  const drain = (): void => {
    timer = null;
    const now = performance.now();
    let [next] = queue;
    while (next && next.at <= now) {
      queue.shift();
      if (next.data === null) {
        next.to.end();
      } else if (!next.to.destroyed) {
        next.to.write(next.data);
      }
      [next] = queue;
    }
    if (next) {
      timer = setTimeout(drain, Math.max(0, next.at - now));
    }
  };
  return {
    send(to, data) {
      const now = performance.now();
      lastAt = Math.max(
        lastAt,
        burstEndsAt(link, now) + delayOf(link) + slowerMs(now)
      );
      queue.push({ at: lastAt, data, to });
      timer ??= setTimeout(drain, Math.max(0, lastAt - now));
    },
  };
};

const NOT_SLOWER = (): number => 0;

interface Lanes {
  readonly down: Lane;
  readonly up: Lane;
}

const bridge = (client: Socket, targetPort: number, lanes: Lanes): void => {
  const upstream = net.connect(targetPort, "127.0.0.1");
  client.setNoDelay(true);
  upstream.setNoDelay(true);
  client.on("data", (data: Buffer) => {
    lanes.up.send(upstream, data);
  });
  upstream.on("data", (data: Buffer) => {
    lanes.down.send(client, data);
  });
  client.on("end", () => {
    lanes.up.send(upstream, null);
  });
  upstream.on("end", () => {
    lanes.down.send(client, null);
  });
  client.on("error", () => {
    upstream.destroy();
  });
  upstream.on("error", () => {
    client.destroy();
  });
};

export const linkServer = (targetPort: number, link: Link): net.Server => {
  const startedAt = performance.now();
  const uploadSlowerMs = (now: number): number =>
    now - startedAt >= link.uploadAfterMs ? link.uploadMs : 0;
  const lanes: Lanes = {
    down: laneOf(link, NOT_SLOWER),
    up: laneOf(link, uploadSlowerMs),
  };
  return net.createServer((client) => {
    bridge(client, targetPort, lanes);
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
  linkServer(Number(target), link).listen(Number(listen), "127.0.0.1");
  yield* Console.log(
    `Port ${listen} reaches ${target} with ${link.rttMs} ms round trip, ${link.jitterMs} ms jitter and ${values.loss}% loss. Press Ctrl-C to stop.`
  );
  return yield* Effect.never;
});
