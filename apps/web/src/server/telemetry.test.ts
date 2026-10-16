import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { HISTOGRAM_BUCKETS, TELEMETRY_VERSION } from "@racer/telemetry/limits";
import type { Batch } from "@racer/telemetry/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createJsonlStore,
  sessionFile,
} from "../../../../tools/perf/jsonl-store.ts";
import { ingestTelemetry } from "./telemetry.ts";

const SESSION = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";

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

const post = (body: string): Request =>
  new Request("http://localhost/api/telemetry", {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  });

let directory = "";

const linesSaved = async (): Promise<number> => {
  const text = await readFile(sessionFile(directory, SESSION), "utf-8");
  return text.split("\n").filter((line) => line !== "").length;
};

describe("the telemetry collector", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "rushline-telemetry-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("saves a batch and acknowledges it by session and batch", async () => {
    const response = await ingestTelemetry(
      post(JSON.stringify(batchOf(0))),
      createJsonlStore(directory)
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      batchId: 0,
      duplicate: false,
      sessionId: SESSION,
    });
    await expect(linesSaved()).resolves.toBe(1);
  });

  it("acknowledges a retried batch without saving it twice, even after a restart", async () => {
    const body = JSON.stringify(batchOf(3));
    await ingestTelemetry(post(body), createJsonlStore(directory));
    const again = await ingestTelemetry(
      post(body),
      createJsonlStore(directory)
    );
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toMatchObject({ duplicate: true });
    await expect(linesSaved()).resolves.toBe(1);
  });

  it("refuses a batch that does not match the contract", async () => {
    const broken = { ...batchOf(0), histogram: [1, 2, -3] };
    const response = await ingestTelemetry(
      post(JSON.stringify(broken)),
      createJsonlStore(directory)
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ _tag: "Invalid" });
  });

  it("refuses text that is not JSON", async () => {
    const response = await ingestTelemetry(
      post("{not json"),
      createJsonlStore(directory)
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ _tag: "NotJson" });
  });

  it("refuses a body over the size limit", async () => {
    const response = await ingestTelemetry(
      post(`"${"x".repeat(70_000)}"`),
      createJsonlStore(directory)
    );
    expect(response.status).toBe(413);
  });

  it("answers 503 when no store is mounted, so the client keeps the batch", async () => {
    const response = await ingestTelemetry(
      post(JSON.stringify(batchOf(0))),
      null
    );
    expect(response.status).toBe(503);
  });
});
