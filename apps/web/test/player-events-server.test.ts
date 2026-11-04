import { MAX_EVENT_BATCH_BYTES } from "@racer/telemetry/limits";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { forwardPlayerEvents } from "../src/server/player-events.ts";

const PLAYER = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";
const KEY = "phc_test";

const batch = {
  build: "abc",
  events: [
    {
      agoMs: 1000,
      event: {
        crashes: 2,
        event: "race_ended",
        place: 3,
        raceId: "race-a",
        result: "finished",
        roadMetres: 400,
        seconds: 60,
      },
    },
  ],
  playerId: PLAYER,
};

const decodeCaptured = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      api_key: Schema.String,
      batch: Schema.Array(
        Schema.Struct({
          distinct_id: Schema.String,
          event: Schema.String,
          properties: Schema.Record(Schema.String, Schema.Unknown),
          timestamp: Schema.String,
        })
      ),
    })
  )
);

const requestOf = (body: string, country?: string): Request => {
  const request = new Request("https://game.test/api/events", {
    body,
    headers: { "cf-connecting-ip": "203.0.113.9" },
    method: "POST",
  });
  Object.defineProperty(request, "cf", {
    value: country === undefined ? undefined : { country },
  });
  return request;
};

const forwardedBy = (answer: () => Promise<Response>) => {
  const seen: { url: string; body: string; headers: string }[] = [];
  const send: typeof globalThis.fetch = async (url, init) => {
    seen.push({
      body: await new Response(init?.body).text(),
      headers: JSON.stringify(init?.headers),
      url: new Request(url).url,
    });
    return await answer();
  };
  return { seen, send };
};

const accepted = async (): Promise<Response> =>
  await Promise.resolve(new Response('{"status":"Ok"}'));

const statusOf = async (
  request: Request,
  key: string,
  send: typeof globalThis.fetch
): Promise<number> => {
  const response = await Effect.runPromise(
    forwardPlayerEvents(request, key, send)
  );
  return response.status;
};

describe("forwarding player events", () => {
  it("sends the EU project one event with no person profile", async () => {
    const { seen, send } = forwardedBy(accepted);
    const status = await statusOf(
      requestOf(JSON.stringify(batch), "IN"),
      KEY,
      send
    );
    const body = decodeCaptured(seen[0]?.body);
    expect({ status, url: seen[0]?.url }).toStrictEqual({
      status: 202,
      url: "https://eu.i.posthog.com/batch/",
    });
    expect(body.api_key).toBe(KEY);
    expect(body.batch[0]).toMatchObject({
      distinct_id: PLAYER,
      event: "race_ended",
      properties: {
        $geoip_disable: true,
        $process_person_profile: false,
        build: "abc",
        country: "IN",
        raceId: "race-a",
      },
    });
  });

  it("never passes on the player's IP address", async () => {
    const { seen, send } = forwardedBy(accepted);
    await statusOf(requestOf(JSON.stringify(batch)), KEY, send);
    expect(JSON.stringify(seen)).not.toContain("203.0.113.9");
  });

  it("dates an event by how long ago the browser saw it", async () => {
    const { seen, send } = forwardedBy(accepted);
    const before = Date.now();
    await statusOf(requestOf(JSON.stringify(batch)), KEY, send);
    const [first] = decodeCaptured(seen[0]?.body).batch;
    expect(Date.parse(first?.timestamp ?? "")).toBeLessThanOrEqual(before);
  });

  it("forwards nothing without a key", async () => {
    const { seen, send } = forwardedBy(accepted);
    const status = await statusOf(requestOf(JSON.stringify(batch)), "", send);
    expect({ sent: seen.length, status }).toStrictEqual({
      sent: 0,
      status: 503,
    });
  });

  it("refuses an event name the list does not have", async () => {
    const { seen, send } = forwardedBy(accepted);
    const status = await statusOf(
      requestOf(
        JSON.stringify({
          ...batch,
          events: [{ agoMs: 0, event: { event: "guest_name", name: "Vidu" } }],
        })
      ),
      KEY,
      send
    );
    expect({ sent: seen.length, status }).toStrictEqual({
      sent: 0,
      status: 400,
    });
  });

  it("drops a field the list does not have, such as a name", async () => {
    const { seen, send } = forwardedBy(accepted);
    await statusOf(
      requestOf(
        JSON.stringify({
          ...batch,
          events: [{ agoMs: 0, event: { event: "race_again", name: "Vidu" } }],
        })
      ),
      KEY,
      send
    );
    expect(seen[0]?.body).not.toContain("Vidu");
  });

  it("refuses an oversized batch", async () => {
    const { send } = forwardedBy(accepted);
    const status = await statusOf(
      requestOf("x".repeat(MAX_EVENT_BATCH_BYTES + 1)),
      KEY,
      send
    );
    expect(status).toBe(413);
  });

  it("answers 502 when PostHog refuses or cannot be reached", async () => {
    const refusing = forwardedBy(
      async () => await Promise.resolve(new Response("no", { status: 500 }))
    );
    const unreachable = forwardedBy(async () => {
      await Promise.resolve();
      throw new Error("Unreachable.");
    });
    await expect(
      statusOf(requestOf(JSON.stringify(batch)), KEY, refusing.send)
    ).resolves.toBe(502);
    await expect(
      statusOf(requestOf(JSON.stringify(batch)), KEY, unreachable.send)
    ).resolves.toBe(502);
  });
});
