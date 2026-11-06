import { MOST_SEATS } from "@racer/sim/room";
import { ROOM_PROTOCOL } from "@racer/sim/room-wire";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { decodeQueueMessage } from "../src/queue-messages.ts";
import type { QueueMessage } from "../src/queue-messages.ts";
import { createQueue } from "../src/queue.ts";
import { launchRoomConfig, msOf } from "../src/room-config.ts";

const QUEUE_WAIT_MS = msOf(launchRoomConfig.queueWaitSeconds);

const ticketSocket = () => {
  let closed = false;
  const heard: QueueMessage[] = [];
  return {
    close: () => {
      closed = true;
    },
    closed: () => closed,
    heard,
    send: (data: string | ArrayBufferView) => {
      const message = decodeQueueMessage(data);
      if (Option.isSome(message)) {
        heard.push(message.value);
      }
    },
  };
};

const placedIn = (socket: ReturnType<typeof ticketSocket>): string | null => {
  const last = socket.heard.at(-1);
  return last?.kind === "placed" ? last.roomId : null;
};

const claim = { build: "test", protocol: ROOM_PROTOCOL };

const openQueue = () => {
  let now = 0;
  let rooms = 0;
  let noted = 0;
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
  const advance = (ms: number): void => {
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
  return { advance, noted: () => noted, queue };
};

describe("the public queue", () => {
  it("places a full group in one room the moment the eighth rider joins", () => {
    const { noted, queue } = openQueue();
    const early = Array.from({ length: MOST_SEATS - 1 }, ticketSocket);
    for (const socket of early) {
      queue.enter(socket, claim);
    }
    expect(early.map(placedIn).filter(Boolean)).toHaveLength(0);
    const last = ticketSocket();
    queue.enter(last, claim);
    expect(new Set([...early, last].map(placedIn))).toStrictEqual(
      new Set(["pub-room-1"])
    );
    expect(last.closed()).toBeTruthy();
    expect(noted()).toBe(1);
  });

  it("sends whoever is here once the oldest rider has waited its time", () => {
    const { advance, queue } = openQueue();
    const first = ticketSocket();
    const second = ticketSocket();
    queue.enter(first, claim);
    advance(QUEUE_WAIT_MS - 10_000);
    queue.enter(second, claim);
    advance(9999);
    expect(placedIn(first)).toBeNull();
    advance(1);
    expect(placedIn(first)).toBe("pub-room-1");
    expect(placedIn(second)).toBe("pub-room-1");
  });

  it("tells everyone how many are here, and forgets a rider who leaves", () => {
    const { queue } = openQueue();
    const first = ticketSocket();
    const second = ticketSocket();
    queue.enter(first, claim);
    queue.enter(second, claim);
    expect(first.heard.at(-1)).toStrictEqual({ kind: "waiting", riders: 2 });
    queue.gone(second);
    expect(first.heard.at(-1)).toStrictEqual({ kind: "waiting", riders: 1 });
    expect(queue.status().waiting).toBe(1);
  });

  it("gives the next rider a clock of their own after the oldest leaves", () => {
    const { advance, queue } = openQueue();
    const first = ticketSocket();
    const second = ticketSocket();
    queue.enter(first, claim);
    advance(QUEUE_WAIT_MS - 1000);
    queue.enter(second, claim);
    queue.gone(first);
    advance(1000);
    expect(placedIn(second)).toBeNull();
    advance(QUEUE_WAIT_MS);
    expect(placedIn(second)).toBe("pub-room-1");
  });

  it("refuses an older build", () => {
    const { queue } = openQueue();
    const stale = ticketSocket();
    queue.enter(stale, { ...claim, build: "older" });
    expect(stale.heard).toStrictEqual([{ kind: "refused", reason: "build" }]);
    expect(queue.status().waiting).toBe(0);
  });
});
