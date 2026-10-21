import { setImmediate } from "node:timers/promises";

import {
  HISTOGRAM_BUCKETS,
  TELEMETRY_VERSION,
  reportIdOf,
} from "@racer/telemetry/limits";
import { memoryStore } from "@racer/telemetry/memory-store";
import type { Ack, Batch } from "@racer/telemetry/schema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Outgoing } from "../src/diagnostics/recorder.ts";
import { createUploadRuntime } from "../src/diagnostics/uploader-runtime.ts";
import { createUploader } from "../src/diagnostics/uploader.ts";
import type { UploadQueue } from "../src/diagnostics/uploader.ts";
import { collect } from "../src/server/telemetry.ts";

const SESSION = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";
const OTHER_SESSION = "5a1b2c3d-0000-4000-8000-000000000002";

const batchOf = (batchId: number, report = false): Batch => ({
  at: 30_000,
  batchId,
  discardedMs: 0,
  dropped: { batches: 0, events: 0, faults: 0 },
  events: [],
  frames: 1800,
  fromFrame: 0,
  histogram: Array.from({ length: HISTOGRAM_BUCKETS }, () => 0),
  kind: report ? "report" : "periodic",
  parts: ["sim"],
  quality: null,
  reportId: report ? reportIdOf(SESSION, batchId) : null,
  sentAt: "2026-10-16T10:00:00.000Z",
  session: {
    build: { dirty: false, sha: "a90c5bc" },
    device: "air",
    pixelRatio: 2,
    renderer: "ANGLE (Apple)",
    screenHeight: 956,
    screenWidth: 1470,
    sessionId: SESSION,
    startedAt: "2026-10-16T09:59:30.000Z",
    userAgent: "test",
  },
  toFrame: 1800,
  totalMs: 30_000,
  version: TELEMETRY_VERSION,
  worst: [],
});

const outgoing = (batchId: number, report = false): Outgoing => {
  const batch = batchOf(batchId, report);
  return { batch, body: JSON.stringify(batch) };
};

const ackOf = (batch: Batch, duplicate = false): Ack => ({
  batchId: batch.batchId,
  duplicate,
  sessionId: batch.session.sessionId,
});

interface Call {
  readonly body: RequestInit["body"];
  readonly answer: (response: Response) => void;
  readonly fail: (error: Error) => void;
}

const ticks = async (count = 20): Promise<void> => {
  await setImmediate();
  if (count > 1) {
    await ticks(count - 1);
  }
};

const fixture = async (respond?: (body: Call["body"]) => Response) => {
  const services = await Effect.runPromise(
    Effect.scoped(Layer.build(TestClock.layer()))
  );
  const calls: Call[] = [];
  const send: typeof globalThis.fetch = async (_input, init) => {
    const exchange = Promise.withResolvers<Response>();
    calls.push({
      answer: exchange.resolve,
      body: init?.body,
      fail: exchange.reject,
    });
    if (respond !== undefined) {
      exchange.resolve(respond(init?.body));
    }
    return await exchange.promise;
  };
  const runtime = createUploadRuntime(send, services);
  let port: UploadQueue | null = null;
  const uploader = createUploader((queue) => {
    port = queue;
    runtime.drain(queue);
  });
  return {
    advance: async (milliseconds: number) => {
      await Effect.runPromiseWith(services)(TestClock.adjust(milliseconds));
      await ticks();
    },
    calls,
    next: () => port?.next(),
    uploader,
  };
};

type Rig = Awaited<ReturnType<typeof fixture>>;

const INVALID_ACK = "collector acknowledgement invalid";
const REPORT = reportIdOf(SESSION, 0);

const queuedFor = (reason: string) => ({
  reason,
  reportId: REPORT,
  state: "queued",
});

const failedFor = (reason: string) => ({
  reason,
  reportId: REPORT,
  state: "failed",
});

const savedReport = { reportId: REPORT, state: "saved" };

const status = (code: number) => new Response(null, { status: code });

const view = (rig: Rig) => ({
  bodies: rig.calls.map((call) => call.body),
  dropped: rig.uploader.droppedBatches(),
  queued: rig.uploader.queued(),
  report: rig.uploader.report(),
});

const bodiesAfterWaits = async (
  rig: Rig,
  waits: readonly number[],
  seen: readonly number[] = []
): Promise<readonly number[]> => {
  const [wait, ...rest] = waits;
  if (wait === undefined) {
    return seen;
  }
  rig.calls.at(-1)?.answer(status(503));
  await rig.advance(wait - 1);
  rig.uploader.drain();
  await ticks();
  const early = rig.calls.length;
  await rig.advance(1);
  return await bodiesAfterWaits(rig, rest, [...seen, early, rig.calls.length]);
};

describe("the uploader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      "a matching new acknowledgement",
      (call: Call | undefined, batch: Batch) => {
        call?.answer(Response.json(ackOf(batch)));
      },
      savedReport,
    ],
    [
      "a matching duplicate acknowledgement",
      (call: Call | undefined, batch: Batch) => {
        call?.answer(Response.json(ackOf(batch, true)));
      },
      savedReport,
    ],
    [
      "an empty 204",
      (call: Call | undefined) => {
        call?.answer(status(204));
      },
      queuedFor(INVALID_ACK),
    ],
    [
      "JSON that is not an acknowledgement",
      (call: Call | undefined) => {
        call?.answer(Response.json({ saved: true }));
      },
      queuedFor(INVALID_ACK),
    ],
    [
      "a body that is not JSON",
      (call: Call | undefined) => {
        call?.answer(new Response("saved", { status: 200 }));
      },
      queuedFor(INVALID_ACK),
    ],
    [
      "an acknowledgement with an invalid field",
      (call: Call | undefined, batch: Batch) => {
        call?.answer(Response.json({ ...ackOf(batch), batchId: -1 }));
      },
      queuedFor(INVALID_ACK),
    ],
    [
      "an acknowledgement for another session",
      (call: Call | undefined, batch: Batch) => {
        call?.answer(
          Response.json({ ...ackOf(batch), sessionId: OTHER_SESSION })
        );
      },
      queuedFor(INVALID_ACK),
    ],
    [
      "an acknowledgement for another batch",
      (call: Call | undefined, batch: Batch) => {
        call?.answer(
          Response.json({ ...ackOf(batch), batchId: batch.batchId + 1 })
        );
      },
      queuedFor(INVALID_ACK),
    ],
    [
      "a 400",
      (call: Call | undefined) => {
        call?.answer(status(400));
      },
      failedFor("collector answered 400"),
    ],
    [
      "a 413",
      (call: Call | undefined) => {
        call?.answer(status(413));
      },
      failedFor("collector answered 413"),
    ],
    [
      "a 503",
      (call: Call | undefined) => {
        call?.answer(status(503));
      },
      queuedFor("collector answered 503"),
    ],
    [
      "a fetch that rejects",
      (call: Call | undefined) => {
        call?.fail(new TypeError("Failed to fetch"));
      },
      queuedFor("collector unreachable"),
    ],
  ])("settles a report answered with %s", async (_answer, answer, report) => {
    const rig = await fixture();
    const sent = outgoing(0, true);
    rig.uploader.enqueue(sent, true);
    rig.uploader.drain();
    await ticks();
    const entry = rig.next();
    answer(rig.calls[0], sent.batch);
    await ticks();
    const kept = report.state === "queued";
    expect(view(rig)).toStrictEqual({
      bodies: [sent.body],
      dropped: 0,
      queued: Number(kept),
      report,
    });
    expect({
      attempts: entry?.attempts,
      same: rig.next() === entry,
    }).toStrictEqual({
      attempts: Number(kept),
      same: kept,
    });
  });

  it("retries after 4, 8, 16, 32 and 60 seconds with the original body, one exchange at a time", async () => {
    const rig = await fixture();
    const sent = outgoing(0);
    rig.uploader.setAutomatic(true);
    rig.uploader.enqueue(sent, false);
    rig.uploader.drain();
    rig.uploader.drain();
    await ticks();
    rig.uploader.drain();
    await ticks();
    expect(rig.calls).toHaveLength(1);
    await expect(
      bodiesAfterWaits(rig, [4000, 8000, 16_000, 32_000, 60_000, 60_000])
    ).resolves.toStrictEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
    expect(view(rig)).toStrictEqual({
      bodies: Array.from({ length: 7 }, () => sent.body),
      dropped: 0,
      queued: 1,
      report: { state: "idle" },
    });
  });

  it("sends nothing without consent, and a report forces the queue", async () => {
    const rig = await fixture();
    const periodic = outgoing(0);
    const report = outgoing(1, true);
    rig.uploader.enqueue(periodic, false);
    rig.uploader.drain();
    await ticks();
    expect(rig.calls).toHaveLength(0);
    rig.uploader.setAutomatic(true);
    rig.uploader.drain();
    await ticks();
    rig.calls[0]?.answer(status(503));
    await ticks();
    rig.uploader.setAutomatic(false);
    await rig.advance(4000);
    expect(rig.calls).toHaveLength(1);
    rig.uploader.enqueue(report, true);
    rig.uploader.forceAll();
    rig.uploader.drain();
    await ticks();
    rig.calls[1]?.answer(Response.json(ackOf(periodic.batch)));
    await ticks();
    rig.calls[2]?.answer(Response.json(ackOf(report.batch)));
    await ticks();
    expect(view(rig)).toStrictEqual({
      bodies: [periodic.body, periodic.body, report.body],
      dropped: 0,
      queued: 0,
      report: { reportId: reportIdOf(SESSION, 1), state: "saved" },
    });
  });

  it("keeps 24 batches and drops the oldest periodic batch before a report", async () => {
    const batches = new Map<Call["body"], Batch>();
    const rig = await fixture((body) =>
      Response.json(ackOf(batches.get(body) ?? batchOf(-1)))
    );
    const sent = [
      outgoing(0, true),
      ...Array.from({ length: 24 }, (_, index) => outgoing(index + 1)),
    ];
    for (const each of sent) {
      batches.set(each.body, each.batch);
      rig.uploader.enqueue(each, false);
    }
    expect(rig.uploader.queued()).toBe(24);
    rig.uploader.setAutomatic(true);
    rig.uploader.drain();
    await vi.waitFor(() => {
      expect(rig.uploader.queued()).toBe(0);
    });
    expect(view(rig)).toStrictEqual({
      bodies: sent.filter((_, index) => index !== 1).map((each) => each.body),
      dropped: 1,
      queued: 0,
      report: savedReport,
    });
  });

  it("drops the oldest report when every batch is a report, and ignores its late answer", async () => {
    const rig = await fixture();
    for (let id = 0; id < 24; id += 1) {
      rig.uploader.enqueue(outgoing(id, true), true);
    }
    rig.uploader.drain();
    await ticks();
    rig.uploader.enqueue(outgoing(24, true), true);
    const newest = { reportId: reportIdOf(SESSION, 24), state: "sending" };
    expect(rig.uploader.report()).toStrictEqual(newest);
    rig.calls[0]?.answer(status(400));
    await ticks();
    expect(view(rig)).toStrictEqual({
      bodies: [outgoing(0, true).body, outgoing(1, true).body],
      dropped: 1,
      queued: 24,
      report: newest,
    });
  });

  it("removes a batch whose answer was lost once the collector acknowledges it as a duplicate", async () => {
    const store = memoryStore();
    const rig = await fixture();
    const report = outgoing(0, true);
    const collector = async () =>
      await Effect.runPromise(
        collect(
          new Request("http://localhost/api/telemetry", {
            body: report.body,
            method: "POST",
          }),
          Option.some(store.layer)
        )
      );
    rig.uploader.enqueue(report, true);
    rig.uploader.drain();
    await ticks();
    const lost = await collector();
    await expect(lost.json()).resolves.toStrictEqual(ackOf(report.batch));
    rig.calls[0]?.fail(new TypeError("Failed to fetch"));
    await ticks();
    expect(rig.uploader.report()).toStrictEqual(
      queuedFor("collector unreachable")
    );
    await rig.advance(4000);
    rig.calls[1]?.answer(await collector());
    await ticks();
    expect(view(rig)).toStrictEqual({
      bodies: [report.body, report.body],
      dropped: 0,
      queued: 0,
      report: savedReport,
    });
    expect(store.lines()).toHaveLength(1);
  });

  it("never counts a beacon as saved", async () => {
    const beacons: Blob[] = [];
    vi.stubGlobal("navigator", {
      sendBeacon: (_url: string, data: Blob) => {
        beacons.push(data);
        return true;
      },
    });
    const rig = await fixture();
    const report = outgoing(0, true);
    rig.uploader.enqueue(report, true);
    rig.uploader.beacon();
    await expect(
      Promise.all(beacons.map(async (beacon) => await beacon.text()))
    ).resolves.toStrictEqual([report.body]);
    expect(view(rig)).toStrictEqual({
      bodies: [],
      dropped: 0,
      queued: 1,
      report: { reportId: REPORT, state: "sending" },
    });
  });
});
