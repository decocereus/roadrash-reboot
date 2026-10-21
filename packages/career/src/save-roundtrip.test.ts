import { describe, expect, it } from "vitest";

import { decent, enter, play, seasonAt, weak } from "./career-fixtures.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";

type Json = null | boolean | number | string | Json[] | JsonRecord;

interface JsonRecord {
  readonly [key: string]: Json;
}

const isJsonRecord = (value: Json): value is JsonRecord =>
  Object(value) === value && !Array.isArray(value);

const withField = (node: Json, path: readonly string[], value: Json): Json => {
  const [key, ...rest] = path;
  if (key === undefined) {
    return value;
  }
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      String(index) === key ? withField(item, rest, value) : item
    );
  }
  if (!isJsonRecord(node)) {
    throw new Error(`The save has nothing at ${key}.`);
  }
  return { ...node, [key]: withField(node[key] ?? null, rest, value) };
};

const parseJson: (text: string) => Json = JSON.parse;

const corrupted = (career: CareerState, path: string, value: Json): string => {
  const save = parseJson(serialiseCareer(career));
  return JSON.stringify(withField(save, path.split("."), value));
};

const verdictOn = (save: string): string => {
  const result = parseCareer(save);
  return result.ok ? "loaded" : `${result.error.kind}:${result.error.field}`;
};

describe("the save", () => {
  it("a career round-trips through its save text", () => {
    const careers = [
      newCareer(1),
      seasonAt(decent, 5).end,
      seasonAt(weak, 3).start,
      enter(seasonAt(decent, 2).start, "cinder-wash").career,
      play(newCareer(2), { ends: "busted", roadId: "slag-row" }).career,
      play(newCareer(2), { ends: "wrecked", roadId: "slag-row" }).career,
    ];
    expect(
      careers.map((career) => parseCareer(serialiseCareer(career)))
    ).toStrictEqual(careers.map((career) => ({ career, ok: true })));
  });

  it("text that is not a save, or a save from another version, is rejected with the reason", () => {
    const good = seasonAt(decent, 2).end;
    expect([
      verdictOn(serialiseCareer(good).slice(0, -40)),
      verdictOn("[]"),
      verdictOn('"a save"'),
      verdictOn(corrupted(good, "version", 1)),
    ]).toStrictEqual([
      "notJson:",
      "notJson:",
      "notJson:",
      "wrongVersion:version",
    ]);
  });

  it("a save with a value of the wrong kind or out of range is rejected with the field", () => {
    const good = seasonAt(decent, 2).end;
    const cases: readonly (readonly [string, Json])[] = [
      ["level", 9],
      ["cash", "lots"],
      ["bikeId", "rocket"],
      ["weaponHits", 4],
      ["gameOver", 0],
      ["garage.0", "rocket"],
      ["record.starts", -1],
      ["story.envelope", "burned"],
      ["memory.juno-kade.aggressionBonus", 2],
      ["board.0.kind", "graffiti"],
      ["lastResult.ledger.cashAfter", "lots"],
      ["lastResult.ledger.result", "won"],
      ["lastResult.summary.rows.0.name", 7],
      ["lastResult.summary.rows.0.fate", "vanished"],
      ["lastResult.summary", null],
    ];
    expect(
      cases.map(([path, value]) => verdictOn(corrupted(good, path, value)))
    ).toStrictEqual([
      "invalid:level",
      "invalid:cash",
      "invalid:bikeId",
      "invalid:weaponHits",
      "invalid:gameOver",
      "invalid:garage.0",
      "invalid:record.starts",
      "invalid:story.envelope",
      "invalid:memory.juno-kade.aggressionBonus",
      "invalid:board.0",
      "invalid:lastResult.ledger.cashAfter",
      "invalid:lastResult.ledger.result",
      "invalid:lastResult.summary.rows.0.name",
      "invalid:lastResult.summary.rows.0.fate",
      "invalid:lastResult.summary",
    ]);
  });

  it("an object that cannot be read as text, in place of any field, is an error value and never a throw", () => {
    const good = seasonAt(decent, 2).end;
    const poison: Json = { toString: 1, valueOf: 1 };
    const fields = Object.keys(good).filter((field) => field !== "version");
    const verdicts = fields.map((field) =>
      verdictOn(corrupted(good, field, poison))
    );
    expect(verdictOn(corrupted(good, "version", poison))).toBe(
      "wrongVersion:version"
    );
    expect(
      verdicts.map((verdict, index) =>
        verdict.startsWith(`invalid:${fields[index]}`)
      )
    ).toStrictEqual(fields.map(() => true));
    expect(verdictOn(JSON.stringify(poison))).toBe("wrongVersion:version");
  });

  it("a road or a racer the game does not have is rejected by name instead of being dropped", () => {
    const good = seasonAt(decent, 2).end;
    expect([
      verdictOn(corrupted(good, "qualified.1.moon-road", 1)),
      verdictOn(corrupted(good, "season.player.lastAhead.nobody", 1)),
    ]).toStrictEqual([
      "invalid:qualified.1.moon-road",
      "invalid:season.player.lastAhead.nobody",
    ]);
  });

  it("a save that contradicts itself is rejected with the field that does not fit", () => {
    const racing = enter(seasonAt(decent, 2).start, "cinder-wash").career;
    const settled = seasonAt(decent, 2).end;
    const { starts } = settled.record;
    expect([
      verdictOn(corrupted(racing, "activeRace.bikeId", "ostra-nera-1000")),
      verdictOn(corrupted(racing, "gameOver", true)),
      verdictOn(corrupted(racing, "activeRace.raceId", 1)),
      verdictOn(corrupted(racing, "activeRace.level", 1)),
      verdictOn(
        corrupted(settled, "activeRace", {
          bikeId: settled.bikeId,
          level: settled.level,
          raceId: starts,
          roadId: "slag-row",
          seed: 1,
          started: true,
        })
      ),
      verdictOn(
        corrupted(settled, "season.player.lastAhead.juno-kade", starts + 1)
      ),
      verdictOn(corrupted(settled, "lastResult.summary.raceId", starts + 1)),
      verdictOn(corrupted(settled, "memory.juno-kade.sharedRace", starts + 1)),
      verdictOn(corrupted(settled, "bikeId", "ostra-nera-1000")),
    ]).toStrictEqual([
      "inconsistent:activeRace.bikeId",
      "inconsistent:gameOver",
      "inconsistent:activeRace.raceId",
      "inconsistent:activeRace.level",
      "inconsistent:lastResult",
      "inconsistent:season.player.lastAhead.juno-kade",
      "inconsistent:lastResult.summary.raceId",
      "inconsistent:memory.juno-kade",
      "inconsistent:garage",
    ]);
  });
});
