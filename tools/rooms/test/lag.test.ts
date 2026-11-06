import { once } from "node:events";
import net from "node:net";

import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { linkServer } from "../src/lag.ts";
import type { Link } from "../src/lag.ts";

const JITTERY: Link = {
  burstEveryMs: 0,
  burstMs: 0,
  jitterMs: 400,
  lossShare: 0,
  rttMs: 200,
  uploadAfterMs: 0,
  uploadMs: 0,
};

const OPENS = 12;
const GAP_MS = 5;
const ARRIVAL_WAIT_MS = 5000;

const decodeAddress = Schema.decodeUnknownSync(
  Schema.Struct({ port: Schema.Number })
);

describe("a lagged link", () => {
  const servers: net.Server[] = [];
  const sockets: net.Socket[] = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.destroy();
    }
    for (const server of servers.splice(0)) {
      server.close();
    }
  });

  const listening = async (server: net.Server): Promise<number> => {
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return decodeAddress(server.address()).port;
  };

  it("delivers connections opened moments apart in the order they were opened", async () => {
    const arrived: string[] = [];
    const room = net.createServer((socket) => {
      sockets.push(socket);
      socket.on("data", (data: Buffer) => {
        arrived.push(data.toString());
      });
    });
    const linkPort = await listening(
      linkServer(await listening(room), JITTERY)
    );
    const sent = Array.from({ length: OPENS }, (_, open) => `open ${open}`);
    for (const [open, line] of sent.entries()) {
      setTimeout(() => {
        const socket = net.connect(linkPort, "127.0.0.1");
        sockets.push(socket);
        socket.write(line);
      }, open * GAP_MS);
    }
    await vi.waitFor(
      () => {
        expect(arrived).toHaveLength(OPENS);
      },
      { interval: GAP_MS, timeout: ARRIVAL_WAIT_MS }
    );
    expect(arrived).toStrictEqual(sent);
  });
});
