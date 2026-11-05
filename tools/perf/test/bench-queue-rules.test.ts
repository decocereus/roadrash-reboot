import {
  IDLE_MS,
  OVERRUN_MS,
  STOP_MS,
  book,
  describeQueue,
  endJob,
  overdueJob,
  release,
  settle,
  startGroup,
  startJob,
  touch,
  turnOf,
} from "@racer/devtools/bench-queue";
import type { BookingRequest, QueueFile } from "@racer/devtools/bench-queue";
import { describe, expect, it } from "vitest";

const MINUTE = 60_000;
const T0 = new Date(2026, 10, 6, 12, 0).getTime();
const LIVE = 4100;
const DEAD = 4200;
const isAlive = (pid: number) => pid !== DEAD;
const emptyQueue = (): QueueFile => ({
  ended: [],
  holder: null,
  next: 1,
  waiting: [],
});

const lane = (name: string, minutes = 30): BookingRequest => ({
  lane: name,
  minutes,
  owner: { kind: "lane" },
  purpose: `${name} work`,
});

const bench = (pid: number): BookingRequest => ({
  lane: "bench",
  minutes: 120,
  owner: { kind: "process", pid },
  purpose: `bench of pid ${pid}`,
});

const bookAll = (requests: readonly BookingRequest[], at = T0) => {
  let queue = emptyQueue();
  const ids: string[] = [];
  for (const request of requests) {
    const [next, id] = book(queue, request, at);
    queue = settle(next, at, isAlive);
    ids.push(id);
  }
  return { ids, queue };
};

describe("the bench queue's rules", () => {
  it("gives the first booking the turn at once and queues the rest in order with unique ids", () => {
    const { ids, queue } = bookAll([lane("maps"), lane("mp"), lane("maps")]);
    expect(ids).toStrictEqual(["maps-1", "mp-2", "maps-3"]);
    expect(turnOf(queue, "maps-1")).toMatchObject({
      holder: { since: T0, use: { kind: "idle", since: T0 } },
      kind: "held",
    });
    expect(turnOf(queue, "mp-2")).toMatchObject({ kind: "waiting", place: 1 });
    expect(turnOf(queue, "maps-3")).toMatchObject({
      kind: "waiting",
      place: 2,
    });
  });

  it("hands the turn to the next lane, stamped when the holder releases", () => {
    const { queue } = bookAll([lane("maps"), lane("mp")]);
    const later = T0 + 7 * MINUTE;
    const next = settle(
      release(queue, "maps-1", later, "released"),
      later,
      isAlive
    );
    expect(turnOf(next, "mp-2")).toMatchObject({
      holder: { since: later, use: { kind: "idle", since: later } },
      kind: "held",
    });
    expect(next.ended[0]).toMatchObject({
      at: later,
      id: "maps-1",
      why: "released",
    });
  });

  it("drops a booking whose process died wherever it stands", () => {
    let queue = emptyQueue();
    for (const request of [
      bench(DEAD),
      lane("maps"),
      bench(DEAD),
      lane("mp"),
    ]) {
      [queue] = book(queue, request, T0);
    }
    expect(queue.holder?.booking.id).toBe("bench-1");
    const later = T0 + MINUTE;
    const settled = settle(queue, later, isAlive);
    expect(settled.holder).toMatchObject({
      booking: { id: "maps-2" },
      since: later,
    });
    expect(settled.waiting.map((entry) => entry.id)).toStrictEqual(["mp-4"]);
    expect(settled.ended.map((entry) => [entry.id, entry.why])).toStrictEqual([
      ["bench-1", `its process ${DEAD} died`],
      ["bench-3", `its process ${DEAD} died`],
    ]);
  });

  it("returns a lane's turn to idle when its job's process dies, and ends a process booking", () => {
    const { queue } = bookAll([lane("maps")]);
    const running = startJob(queue, "maps-1", DEAD, "perf:gpu");
    const later = T0 + 3 * MINUTE;
    expect(settle(running, later, isAlive).holder).toMatchObject({
      booking: { id: "maps-1" },
      since: T0,
      use: { kind: "idle", since: later },
    });
    const own = settle(book(emptyQueue(), bench(LIVE), T0)[0], T0, isAlive);
    const crashed = settle(
      startJob(own, "bench-1", LIVE, "measure"),
      later,
      (pid) => pid !== LIVE
    );
    expect(crashed.holder).toBeNull();
    expect(crashed.ended[0]?.why).toBe(`its process ${LIVE} died`);
  });

  it("keeps a turn until its expected end plus 15 min and drops it one ms later", () => {
    const { queue } = bookAll([lane("maps", 30), lane("mp")]);
    const running = startJob(queue, "maps-1", DEAD, "perf:gpu");
    const limit = T0 + 30 * MINUTE + OVERRUN_MS;
    expect(settle(running, limit, isAlive).holder?.booking.id).toBe("maps-1");
    const over = settle(running, limit + 1, isAlive);
    expect(over.ended[0]?.why).toBe(
      "ran past its expected end 12:30 by more than 15 min"
    );
    expect(over.holder).toMatchObject({
      booking: { id: "mp-2" },
      since: limit + 1,
    });
  });

  it("drops a turn left idle for more than 10 min, and a touch restarts the clock", () => {
    const { queue } = bookAll([lane("maps"), lane("mp")]);
    expect(settle(queue, T0 + IDLE_MS, isAlive).holder?.booking.id).toBe(
      "maps-1"
    );
    const idled = settle(queue, T0 + IDLE_MS + 1, isAlive);
    expect(idled.ended[0]).toMatchObject({
      id: "maps-1",
      why: "idle for more than 10 min",
    });
    const touched = touch(queue, "maps-1", T0 + 9 * MINUTE);
    expect(settle(touched, T0 + 15 * MINUTE, isAlive).holder?.booking.id).toBe(
      "maps-1"
    );
  });

  it("never counts idle time while a job runs", () => {
    const { queue } = bookAll([lane("maps", 60)]);
    const running = startJob(queue, "maps-1", LIVE, "perf:gpu");
    expect(
      settle(running, T0 + 40 * MINUTE, isAlive).holder?.use
    ).toStrictEqual({
      group: null,
      kind: "job",
      label: "perf:gpu",
      pid: LIVE,
    });
  });

  it("keeps a job running while its workload's process group lives after its wrapper died", () => {
    const { queue } = bookAll([lane("maps", 60)]);
    const running = startGroup(
      startJob(queue, "maps-1", DEAD, "campaign"),
      DEAD,
      LIVE
    );
    const later = T0 + 5 * MINUTE;
    expect(
      settle(running, later, (pid) => pid === -LIVE).holder?.use
    ).toMatchObject({ group: LIVE, kind: "job" });
    expect(settle(running, later, () => false).holder?.use).toStrictEqual({
      kind: "idle",
      since: later,
    });
  });

  it("never passes a turn on while its job lives, and names the job to stop one minute past its deadline", () => {
    const { queue } = bookAll([lane("maps", 30), lane("mp")]);
    const running = startJob(queue, "maps-1", LIVE, "perf:gpu");
    const limit = T0 + 30 * MINUTE + OVERRUN_MS + STOP_MS;
    expect(overdueJob(running, limit, isAlive)).toBeNull();
    expect(overdueJob(running, limit + 1, isAlive)).toMatchObject({
      pid: LIVE,
    });
    expect(settle(running, limit + 1, isAlive).holder?.booking.id).toBe(
      "maps-1"
    );
    expect(settle(running, limit + 1, () => false).holder?.booking.id).toBe(
      "mp-2"
    );
  });

  it("returns a lane's turn to idle when its job ends, and ends a process booking as finished", () => {
    const { queue } = bookAll([lane("maps")]);
    const later = T0 + 5 * MINUTE;
    const ended = endJob(
      startJob(queue, "maps-1", LIVE, "perf:gpu"),
      "maps-1",
      later
    );
    expect(ended.holder?.use).toStrictEqual({ kind: "idle", since: later });
    const own = settle(book(emptyQueue(), bench(LIVE), T0)[0], T0, isAlive);
    const finished = endJob(
      startJob(own, "bench-1", LIVE, "measure"),
      "bench-1",
      later
    );
    expect(finished.holder).toBeNull();
    expect(finished.ended[0]).toMatchObject({ id: "bench-1", why: "finished" });
  });

  it("keeps the 20 newest ended bookings, newest first", () => {
    let queue = emptyQueue();
    for (let index = 1; index <= 25; index += 1) {
      const [next, id] = book(queue, lane("maps"), T0 + index);
      queue = release(next, id, T0 + index, "released");
    }
    expect(queue.ended).toHaveLength(20);
    expect(queue.ended[0]?.id).toBe("maps-25");
    expect(queue.ended.at(-1)?.id).toBe("maps-6");
  });

  it("settles to the same queue when it settles twice at the same moment", () => {
    const { queue } = bookAll([
      bench(DEAD),
      lane("maps"),
      lane("mp"),
      bench(DEAD),
    ]);
    const running = startJob(queue, "maps-2", DEAD, "perf:gpu");
    const at = T0 + 4 * MINUTE;
    const once = settle(running, at, isAlive);
    expect(settle(once, at, isAlive)).toStrictEqual(once);
  });

  it("estimates each waiter's start from the minutes booked ahead of it", () => {
    const { queue } = bookAll([
      lane("maps", 30),
      lane("mp", 20),
      lane("road", 10),
    ]);
    expect(describeQueue(queue, T0 + MINUTE)).toStrictEqual([
      "holder   maps-1 holds it for maps work, turn since 12:00, expected end 12:30, idle since 12:00",
      "waiting  1. mp-2 for mp work, 20 min, booked 12:00, starts about 12:30",
      "waiting  2. road-3 for road work, 10 min, booked 12:00, starts about 12:50",
    ]);
    expect(describeQueue(emptyQueue(), T0)).toStrictEqual([
      "free     nobody holds it and nobody waits",
    ]);
  });
});
