import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { jsonlStoreLayer } from "@racer/telemetry/jsonl-store";
import { HISTOGRAM_BUCKETS, TELEMETRY_VERSION } from "@racer/telemetry/limits";
import { memoryStore } from "@racer/telemetry/memory-store";
import { decodeBatchEffect } from "@racer/telemetry/schema";
import type { Batch } from "@racer/telemetry/schema";
import { TelemetryStore } from "@racer/telemetry/store";
import { TelemetryStoreError } from "@racer/telemetry/store-error";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { TestClock } from "effect/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collect, ingest } from "../src/server/telemetry.ts";

const SESSION = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";
const RECEIVED_AT = "2026-10-16T10:00:30.123Z";

const batchOf = (batchId: number): Batch => ({
  at: 30_000,
  batchId,
  discardedMs: 0,
  dropped: { batches: 0, events: 0, faults: 0 },
  events: [
    {
      at: 12_000,
      frame: 700,
      kind: "marker",
      race: 1,
      seq: 4,
      tick: 600,
    },
  ],
  frames: 1800,
  fromFrame: 0,
  histogram: Array.from({ length: HISTOGRAM_BUCKETS }, () => 0),
  kind: "periodic",
  parts: ["sim", "grade"],
  quality: null,
  reportId: null,
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

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/api/telemetry", {
    body,
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

let directory = "";

const jsonl = () =>
  jsonlStoreLayer(directory).pipe(
    Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
  );

const sessionText = async (): Promise<string> =>
  await readFile(path.join(directory, `${SESSION}.jsonl`), "utf-8");

const linesSaved = async (): Promise<number> => {
  const text = await sessionText();
  return text.split("\n").filter((line) => line !== "").length;
};

const answer = async (
  request: Request,
  store: Option.Option<Layer.Layer<TelemetryStore>>
) => {
  const response = await Effect.runPromise(
    Effect.gen(function* answerAt() {
      yield* TestClock.setTime(Date.parse(RECEIVED_AT));
      return yield* collect(request, store);
    }).pipe(Effect.provide(TestClock.layer()))
  );
  return {
    cacheControl: response.headers.get("cache-control"),
    status: response.status,
    text: await response.text(),
  };
};

const sentinel = new Error("sentinel: EACCES on /sessions/secret.jsonl");

const failingStore = Layer.succeed(TelemetryStore)(
  TelemetryStore.of({
    save: () =>
      Effect.fail(
        new TelemetryStoreError({
          cause: sentinel,
          operation: "append",
          path: "/sessions/secret.jsonl",
        })
      ),
  })
);

describe("the telemetry collector", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "rushline-telemetry-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("saves a batch and acknowledges it by session and batch", async () => {
    await expect(
      answer(post(JSON.stringify(batchOf(0))), Option.some(jsonl()))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 200,
      text: `{"batchId":0,"duplicate":false,"sessionId":"${SESSION}"}`,
    });
    const batch = await Effect.runPromise(decodeBatchEffect(batchOf(0)));
    await expect(sessionText()).resolves.toBe(
      `${JSON.stringify({ batch, receivedAt: RECEIVED_AT })}\n`
    );
  });

  it("acknowledges a retried batch without saving it twice, even after a restart", async () => {
    const body = JSON.stringify(batchOf(3));
    await answer(post(body), Option.some(jsonl()));
    await expect(
      answer(post(body), Option.some(jsonl()))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 200,
      text: `{"batchId":3,"duplicate":true,"sessionId":"${SESSION}"}`,
    });
    await expect(linesSaved()).resolves.toBe(1);
  });

  it("refuses a batch that does not match the contract with a fixed issue", async () => {
    const broken = { ...batchOf(0), histogram: [1, 2, -3] };
    await expect(
      answer(post(JSON.stringify(broken)), Option.some(memoryStore().layer))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 400,
      text: '{"_tag":"Invalid","issue":"Invalid telemetry batch."}',
    });
  });

  it("keeps the schema failure as the cause of an invalid batch", async () => {
    const broken = { ...batchOf(0), histogram: [1, 2, -3] };
    const cause = await Effect.runPromise(
      ingest(post(JSON.stringify(broken))).pipe(
        Effect.provide(memoryStore().layer),
        Effect.as(null),
        Effect.catchTag("Invalid", (refusal) => Effect.succeed(refusal.cause))
      )
    );
    expect(String(cause)).toContain('["histogram"][2]');
  });

  it("refuses text that is not JSON", async () => {
    await expect(
      answer(post("{not json"), Option.some(memoryStore().layer))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 400,
      text: '{"_tag":"NotJson"}',
    });
  });

  it("refuses a body it cannot read and keeps the read failure", async () => {
    const request = post(JSON.stringify(batchOf(0)));
    await request.text();
    const cause = await Effect.runPromise(
      ingest(request).pipe(
        Effect.provide(memoryStore().layer),
        Effect.as(null),
        Effect.catchTag("NotJson", (refusal) => Effect.succeed(refusal.cause))
      )
    );
    expect(cause).toBeInstanceOf(TypeError);
  });

  it("refuses a declared size over the limit without reading the body", async () => {
    const request = post("{}", { "content-length": "70000" });
    await expect(
      answer(request, Option.some(memoryStore().layer))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 413,
      text: '{"_tag":"TooLarge","bytes":70000}',
    });
    expect(request.bodyUsed).toBeFalsy();
  });

  it("refuses a body over the size limit, counting UTF-8 bytes", async () => {
    await expect(
      answer(post(`"${"x".repeat(70_000)}"`), Option.some(memoryStore().layer))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 413,
      text: '{"_tag":"TooLarge","bytes":70002}',
    });
    await expect(
      answer(post(`"${"é".repeat(33_000)}"`), Option.some(memoryStore().layer))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 413,
      text: '{"_tag":"TooLarge","bytes":66002}',
    });
  });

  it("answers 503 when no store is mounted, so the client keeps the batch", async () => {
    const request = post(`"${"x".repeat(70_000)}"`);
    await expect(answer(request, Option.none())).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 503,
      text: '{"_tag":"NoStore"}',
    });
    expect(request.bodyUsed).toBeFalsy();
  });

  it("answers 500 with a fixed issue when the store fails, and keeps the cause inside", async () => {
    await expect(
      answer(post(JSON.stringify(batchOf(0))), Option.some(failingStore))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 500,
      text: '{"_tag":"StoreFailed","issue":"Telemetry storage failed."}',
    });
    const cause = await Effect.runPromise(
      ingest(post(JSON.stringify(batchOf(0)))).pipe(
        Effect.provide(failingStore),
        Effect.as(null),
        Effect.catchTag("StoreFailed", (refusal) =>
          Effect.succeed(refusal.cause)
        )
      )
    );
    expect(cause).toBeInstanceOf(TelemetryStoreError);
    expect(cause).toHaveProperty("cause", sentinel);
  });

  it("answers 500 rather than appending after a session file it cannot decode", async () => {
    const file = path.join(directory, `${SESSION}.jsonl`);
    await writeFile(file, "{not json\n", "utf-8");
    await expect(
      answer(post(JSON.stringify(batchOf(0))), Option.some(jsonl()))
    ).resolves.toStrictEqual({
      cacheControl: "no-store",
      status: 500,
      text: '{"_tag":"StoreFailed","issue":"Telemetry storage failed."}',
    });
    await expect(sessionText()).resolves.toBe("{not json\n");
  });
});
