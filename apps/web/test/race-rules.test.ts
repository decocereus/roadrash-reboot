import { RaceRulesSchema } from "@racer/career/rules-schema";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { loadRaceRules, RULES_PATH } from "../src/rules/load.ts";
import type { RulesLoad, RulesTransport } from "../src/rules/load.ts";
import { serveRaceRules } from "../src/server/race-rules.ts";

const decodeRules = Schema.decodeUnknownSync(
  Schema.fromJsonString(RaceRulesSchema)
);

const answering =
  (response: () => Response): RulesTransport["fetch"] =>
  async () =>
    await Promise.resolve(response());

const loaded = async (fetch: RulesTransport["fetch"]): Promise<RulesLoad> => {
  const { promise, resolve } = Promise.withResolvers<RulesLoad>();
  loadRaceRules({ fetch }, resolve);
  return await promise;
};

const failureOf = (load: RulesLoad) =>
  load.status === "failed"
    ? { message: load.failure.message, tag: load.failure._tag }
    : null;

describe("the race rules route", () => {
  it("serves rules the schema accepts, uncached", async () => {
    const response = serveRaceRules();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(decodeRules(text)).toStrictEqual(JSON.parse(text));
  });
});

describe("loading the race rules", () => {
  it("reads the served rules from the rules path", async () => {
    const asked: string[] = [];
    const load = await loaded(async (url) => {
      asked.push(url);
      return await Promise.resolve(serveRaceRules());
    });
    expect([asked, load]).toStrictEqual([
      [RULES_PATH],
      { rules: decodeRules(await serveRaceRules().text()), status: "ready" },
    ]);
  });

  it("names each way the load can fail", async () => {
    const loads = await Promise.all([
      loaded(async () => await Promise.reject(new TypeError("offline"))),
      loaded(answering(() => new Response("down", { status: 503 }))),
      loaded(answering(() => new Response("<html>"))),
      loaded(
        answering(() =>
          Response.json({ fieldSize: 40, levelCount: 3, police: {} })
        )
      ),
    ]);
    expect(loads.map(failureOf)).toStrictEqual([
      { message: "offline", tag: "RulesRequestFailed" },
      {
        message: "The race rules answered 503.",
        tag: "RulesResponseRejected",
      },
      { message: "The race rules did not decode.", tag: "RulesDecodeFailed" },
      { message: "The race rules did not decode.", tag: "RulesDecodeFailed" },
    ]);
  });
});
