import { MOST_SEATS } from "@racer/sim/room";
import {
  PING_PACKET_BYTES,
  ROOM_PROTOCOL,
  writePing,
} from "@racer/sim/room-wire";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { SEAT_WATCH_MS, SILENT_SEAT_MS } from "../src/heartbeat.ts";
import { SEAT_SILENT } from "../src/messages.ts";
import { decodeQueueMessage } from "../src/queue-messages.ts";
import type { QueueMessage } from "../src/queue-messages.ts";
import { createQueue } from "../src/queue.ts";
import { launchRoomConfig, msOf } from "../src/room-config.ts";

const QUEUE_WAIT_MS = msOf(launchRoomConfig.queueWaitSeconds);

const pingPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(PING_PACKET_BYTES);
  writePing(new DataView(buffer), 1, null);
  return buffer;
};

const ticketSocket = () => {
  let closedWith: number | null = null;
  let quiet = false;
  const heard: QueueMessage[] = [];
  let pongs = 0;
  return {
    close: (code: number) => {
      closedWith = code;
    },
    closed: () => closedWith !== null,
    closedWith: () => closedWith,
    goQuiet: () => {
      quiet = true;
    },
    heard,
    pongs: () => pongs,
    quiet: () => quiet,
    send: (data: string | ArrayBufferView) => {
      if (ArrayBuffer.isView(data)) {
        pongs += 1;
        return;
      }
      const message = decodeQueueMessage(data);
      if (Option.isSome(message)) {
        heard.push(message.value);
      }
    },
  };
};

type TicketSocket = ReturnType<typeof ticketSocket>;

const placedIn = (socket: TicketSocket): string | null => {
  const last = socket.heard.at(-1);
  return last?.kind === "placed" ? last.roomId : null;
};

const claim = () => ({
  build: "test",
  key: crypto.randomUUID(),
  protocol: ROOM_PROTOCOL,
});

const openQueue = () => {
  let now = 0;
  let rooms = 0;
  let noted = 0;
  const sockets: TicketSocket[] = [];
  const wakes: { at: number; wake: () => void }[] = [];
  const queue = createQueue({
    after: (ms, wake) => {
      wakes.push({ at: now + ms, wake });
    },
    build: "test",
    config: launchRoomConfig,
    note: () => {
      noted += 1;
    },
    now: () => now,
    roomId: () => {
      rooms += 1;
      return `pub-room-${rooms}`;
    },
  });
  const step = (ms: number): void => {
    for (const socket of sockets) {
      if (!socket.closed() && !socket.quiet()) {
        queue.message(socket, pingPacket());
      }
    }
    now += ms;
    for (const due of wakes.splice(0).filter(({ at, wake }) => {
      if (at > now) {
        wakes.push({ at, wake });
        return false;
      }
      return true;
    })) {
      due.wake();
    }
  };
  const advance = (ms: number): void => {
    for (let left = ms; left > 0; left -= SEAT_WATCH_MS) {
      step(Math.min(left, SEAT_WATCH_MS));
    }
  };
  const ticket = (): TicketSocket => {
    const socket = ticketSocket();
    sockets.push(socket);
    return socket;
  };
  return { advance, noted: () => noted, queue, ticket };
};

describe("the public queue", () => {
  it("places a full group in one room the moment the eighth rider joins", () => {
    const { noted, queue, ticket } = openQueue();
    const early = Array.from({ length: MOST_SEATS - 1 }, ticket);
    for (const socket of early) {
      queue.enter(socket, claim());
    }
    expect(early.map(placedIn).filter(Boolean)).toHaveLength(0);
    const last = ticket();
    queue.enter(last, claim());
    expect(new Set([...early, last].map(placedIn))).toStrictEqual(
      new Set(["pub-room-1"])
    );
    expect(last.closed()).toBeTruthy();
    expect(noted()).toBe(1);
  });

  it("sends whoever is here once the oldest rider has waited its time", () => {
    const { advance, queue, ticket } = openQueue();
    const first = ticket();
    const second = ticket();
    queue.enter(first, claim());
    advance(QUEUE_WAIT_MS - 10_000);
    queue.enter(second, claim());
    advance(9999);
    expect(placedIn(first)).toBeNull();
    advance(1);
    expect(placedIn(first)).toBe("pub-room-1");
    expect(placedIn(second)).toBe("pub-room-1");
  });

  it("tells everyone how many are here, and forgets a rider who leaves", () => {
    const { queue, ticket } = openQueue();
    const first = ticket();
    const second = ticket();
    queue.enter(first, claim());
    queue.enter(second, claim());
    expect(first.heard.at(-1)).toStrictEqual({ kind: "waiting", riders: 2 });
    queue.gone(second);
    expect(first.heard.at(-1)).toStrictEqual({ kind: "waiting", riders: 1 });
    expect(queue.status().waiting).toBe(1);
  });

  it("gives the next rider a clock of their own after the oldest leaves", () => {
    const { advance, queue, ticket } = openQueue();
    const first = ticket();
    const second = ticket();
    queue.enter(first, claim());
    advance(QUEUE_WAIT_MS - 1000);
    queue.enter(second, claim());
    queue.gone(first);
    advance(1000);
    expect(placedIn(second)).toBeNull();
    advance(QUEUE_WAIT_MS);
    expect(placedIn(second)).toBe("pub-room-1");
  });

  it("refuses an older build", () => {
    const { queue, ticket } = openQueue();
    const stale = ticket();
    queue.enter(stale, { ...claim(), build: "older" });
    expect(stale.heard).toStrictEqual([{ kind: "refused", reason: "build" }]);
    expect(queue.status().waiting).toBe(0);
  });
});

describe("a ticket whose link goes quiet", () => {
  it("hears a pong for each ping", () => {
    const { queue, ticket } = openQueue();
    const socket = ticket();
    queue.enter(socket, claim());
    queue.message(socket, pingPacket());
    expect(socket.pongs()).toBe(1);
  });

  it("leaves the queue after 10 s of silence, and the rest hear the new count", () => {
    const { advance, queue, ticket } = openQueue();
    const gone = ticket();
    const here = ticket();
    queue.enter(gone, claim());
    queue.enter(here, claim());
    gone.goQuiet();
    advance(SILENT_SEAT_MS);
    expect(gone.closed()).toBeFalsy();
    advance(SEAT_WATCH_MS);
    expect(gone.closedWith()).toBe(SEAT_SILENT);
    expect(here.heard.at(-1)).toStrictEqual({ kind: "waiting", riders: 1 });
    expect(queue.status().waiting).toBe(1);
  });
});

describe("one member queued from two tabs", () => {
  it("keeps the newest tab in the older tab's place, and tells the older one", () => {
    const { advance, queue, ticket } = openQueue();
    const older = ticket();
    const newer = ticket();
    const member = claim();
    queue.enter(older, member);
    advance(QUEUE_WAIT_MS - 1000);
    queue.enter(newer, member);
    expect(older.heard.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "replaced",
    });
    expect(older.closed()).toBeTruthy();
    expect(queue.status().waiting).toBe(1);
    advance(1000);
    expect(placedIn(newer)).toBe("pub-room-1");
  });

  it("never fills a group from one browser's tabs", () => {
    const { queue, ticket } = openQueue();
    const member = claim();
    const tabs = Array.from({ length: MOST_SEATS }, ticket);
    for (const tab of tabs) {
      queue.enter(tab, member);
    }
    expect(tabs.map(placedIn).filter(Boolean)).toHaveLength(0);
    expect(queue.status().waiting).toBe(1);
  });
});
