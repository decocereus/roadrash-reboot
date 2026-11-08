import { bikeIds } from "@racer/sim/bikes";
import { celebrityRivalIds } from "@racer/sim/cast";
import { weapons } from "@racer/sim/weapons";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { recordedCast } from "./bench.ts";
import { decent, enter, play, seasonAt, weak } from "./career-fixtures.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { newCareer, racerIds } from "./state.ts";
import type { CareerState } from "./state.ts";

type Json = Schema.MutableJson;

const isJsonRecord = (value: Json): value is Schema.MutableJsonObject =>
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

const withoutField = (node: Json, path: readonly string[]): Json => {
  const [key, ...rest] = path;
  if (key === undefined || !isJsonRecord(node)) {
    return node;
  }
  if (rest.length === 0) {
    return Object.fromEntries(
      Object.entries(node).filter(([name]) => name !== key)
    );
  }
  return { ...node, [key]: withoutField(node[key] ?? null, rest) };
};

const parseJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.MutableJson)
);

const corrupted = (career: CareerState, path: string, value: Json): string => {
  const save = parseJson(serialiseCareer(career));
  return JSON.stringify(withField(save, path.split("."), value));
};

const edited = (
  career: CareerState,
  edits: readonly (readonly [string, Json])[]
): string => {
  let save = parseJson(serialiseCareer(career));
  for (const [path, value] of edits) {
    save = withField(save, path.split("."), value);
  }
  return JSON.stringify(save);
};

const missing = (career: CareerState, path: string): string =>
  JSON.stringify(
    withoutField(parseJson(serialiseCareer(career)), path.split("."))
  );

const blank: Json = { bestPlace: null, points: 0, wins: 0 };

const versionSixOf = (career: CareerState): string =>
  JSON.stringify({
    ...career,
    season: Object.fromEntries(
      racerIds.map((racer) => {
        const { points, wins } = career.season[racer];
        return [racer, { lastAhead: {}, points, wins }];
      })
    ),
    version: 6,
  });

const verdictOn = (save: string): string => {
  const result = parseCareer(save);
  return result.ok ? "loaded" : `${result.error.kind}:${result.error.field}`;
};

const rereadOf = (save: string): string => {
  const result = parseCareer(save);
  return result.ok ? serialiseCareer(result.career) : verdictOn(save);
};

const FINGERPRINT_BASE = 1_000_003n;
const FINGERPRINT_MODULUS = 2n ** 61n - 1n;

const fingerprint = (text: string): string => {
  let hash = 0n;
  for (const char of text) {
    hash =
      (hash * FINGERPRINT_BASE + BigInt(char.codePointAt(0) ?? 0)) %
      FINGERPRINT_MODULUS;
  }
  return `${text.length}:${hash.toString(16)}`;
};

const recordedRacers = new Set<string>([
  "player",
  ...recordedCast,
  ...celebrityRivalIds,
]);

const recordedRows = (rows: Json | undefined): Json =>
  isJsonRecord(rows ?? null)
    ? Object.fromEntries(
        Object.entries(rows ?? {}).filter(([racer]) =>
          recordedRacers.has(racer)
        )
      )
    : null;

const recordedBytes = (text: string): string => {
  const save = parseJson(text);
  return isJsonRecord(save)
    ? JSON.stringify({
        ...save,
        memory: recordedRows(save.memory),
        season: recordedRows(save.season),
      })
    : text;
};

const careers = [
  newCareer(1),
  seasonAt(decent, 3).end,
  seasonAt(weak, 3).start,
  enter(seasonAt(decent, 2).start, "breakwater-run").career,
  play(newCareer(2), { ends: "busted", roadId: "slag-row" }).career,
  play(newCareer(2), { ends: "wrecked", roadId: "slag-row" }).career,
];

const versionSevenBytes = [
  ["7450:1eb57f1baccf76a9", "7450:1eb57f1baccf76a9"],
  ["15288:13d091a7e7ad767c", "15288:1f86363f0dc7af63"],
  ["15257:16e0223aba3d0f6c", "15257:f3ec067533c68e"],
  ["7770:1ec8072fd4f9ba2", "7770:ba648b8323f06fa"],
  ["15033:d9641a7316f9687", "15033:d00f83914d5d423"],
  ["14899:b4f4f31ea5a002", "14899:32e127b17ee8bf4"],
];

describe("the save", () => {
  it("a career round-trips through its save text", () => {
    expect(
      careers.map((career) => parseCareer(serialiseCareer(career)))
    ).toStrictEqual(careers.map((career) => ({ career, ok: true })));
  });

  it("a career writes, and reads back into, the same bytes as the version 7 reader", () => {
    expect(
      careers.map((career) => {
        const text = serialiseCareer(career);
        return [
          fingerprint(recordedBytes(text)),
          fingerprint(recordedBytes(rereadOf(text))),
        ];
      })
    ).toStrictEqual(versionSevenBytes);
  });

  it("text that is not a save, or a save from another version, is rejected with the reason", () => {
    const good = seasonAt(decent, 2).end;
    expect([
      verdictOn(serialiseCareer(good).slice(0, -40)),
      verdictOn("[]"),
      verdictOn('"a save"'),
      verdictOn(corrupted(good, "version", 3)),
    ]).toStrictEqual([
      "notJson:",
      "notJson:",
      "notJson:",
      "wrongVersion:version",
    ]);
  });

  it("a save with no version, a later version or a number too large to hold is refused at the version", () => {
    const good = seasonAt(decent, 2).end;
    expect([
      verdictOn(missing(good, "version")),
      verdictOn(corrupted(good, "version", 8)),
      verdictOn('{"version":1e400}'),
      verdictOn(serialiseCareer(good).replace(/"cash":-?\d+/u, '"cash":1e400')),
    ]).toStrictEqual([
      "wrongVersion:version",
      "wrongVersion:version",
      "wrongVersion:version",
      "invalid:cash",
    ]);
  });

  it("a save with a value of the wrong kind or out of range is rejected with the field", () => {
    const good = seasonAt(decent, 2).end;
    const cases: readonly (readonly [string, Json])[] = [
      ["tier", 9],
      ["cash", "lots"],
      ["bikeId", "rocket"],
      ["weaponHits", 4],
      ["gameOver", 0],
      ["garage.0", "rocket"],
      ["record.starts", -1],
      ["story.envelope", "burned"],
      ["memory.juno-kade.aggressionBonus", 2],
      ["season.player.bestPlace", 0],
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
      "invalid:tier",
      "invalid:cash",
      "invalid:bikeId",
      "invalid:weaponHits",
      "invalid:gameOver",
      "invalid:garage.0",
      "invalid:record.starts",
      "invalid:story.envelope",
      "invalid:memory.juno-kade.aggressionBonus",
      "invalid:season.player.bestPlace",
      "invalid:board.0",
      "invalid:lastResult.ledger.cashAfter",
      "invalid:lastResult.ledger.result",
      "invalid:lastResult.summary.rows.0.name",
      "invalid:lastResult.summary.rows.0.fate",
      "invalid:lastResult.summary",
    ]);
  });

  it("a seed or a distance may be fractional, a null is not a missing field, and fields the game does not read are dropped", () => {
    const good = seasonAt(decent, 2).end;
    const racing = enter(seasonAt(decent, 2).start, "breakwater-run").career;
    const extras = edited(good, [
      ["zz", 1],
      ["record.zz", 1],
      ["story.zz", 1],
    ]);
    expect([
      verdictOn(corrupted(good, "seed", 0.5)),
      verdictOn(corrupted(racing, "activeRace.seed", 0.25)),
      verdictOn(corrupted(good, "lastResult.summary.rows.0.metresLeft", 12.5)),
      verdictOn(corrupted(good, "lastResult", null)),
      verdictOn(missing(good, "lastResult")),
      verdictOn(corrupted(good, "story.ending", null)),
      verdictOn(missing(good, "story.ending")),
      verdictOn(missing(good, "activeRace")),
      rereadOf(extras),
    ]).toStrictEqual([
      "loaded",
      "loaded",
      "loaded",
      "loaded",
      "invalid:lastResult",
      "loaded",
      "invalid:story.ending",
      "invalid:activeRace",
      rereadOf(serialiseCareer(good)),
    ]);
  });

  it("a list or a text at its limit loads and one past it is rejected", () => {
    const good = seasonAt(decent, 2).end;
    const left = { kind: "leftRace" };
    expect([
      verdictOn(
        corrupted(good, "lastResult.summary.rows.0.name", "a".repeat(300))
      ),
      verdictOn(
        corrupted(good, "lastResult.summary.rows.0.name", "a".repeat(301))
      ),
      verdictOn(corrupted(good, "garage", [...bikeIds])),
      verdictOn(corrupted(good, "garage", [...bikeIds, good.bikeId])),
      verdictOn(corrupted(good, "board", [left, left, left])),
      verdictOn(corrupted(good, "board", [left, left, left, left])),
    ]).toStrictEqual([
      "loaded",
      "invalid:lastResult.summary.rows.0.name",
      "loaded",
      "invalid:garage",
      "loaded",
      "invalid:board",
    ]);
  });

  it("the hits left on a weapon fit the weapon held", () => {
    const good = seasonAt(decent, 2).end;
    const { hits } = weapons.club;
    expect([
      verdictOn(
        edited(good, [
          ["weapon", "none"],
          ["weaponHits", 1],
        ])
      ),
      verdictOn(
        edited(good, [
          ["weapon", "club"],
          ["weaponHits", 0],
        ])
      ),
      verdictOn(
        edited(good, [
          ["weapon", "club"],
          ["weaponHits", hits],
        ])
      ),
      verdictOn(
        edited(good, [
          ["weapon", "club"],
          ["weaponHits", hits + 1],
        ])
      ),
      verdictOn(
        edited(good, [
          ["weapon", "club"],
          ["weaponHits", 1.5],
        ])
      ),
    ]).toStrictEqual([
      "invalid:weaponHits",
      "invalid:weaponHits",
      "loaded",
      "invalid:weaponHits",
      "invalid:weaponHits",
    ]);
  });

  it("a save with two problems is rejected at the one the version 2 reader reported", () => {
    const good = seasonAt(decent, 2).end;
    const racing = enter(seasonAt(decent, 2).start, "breakwater-run").career;
    expect([
      verdictOn(
        edited(good, [
          ["cash", "lots"],
          ["weapon", "laser"],
        ])
      ),
      verdictOn(
        edited(good, [
          ["qualified.1.ridge-road", 9],
          ["cash", "lots"],
        ])
      ),
      verdictOn(
        edited(racing, [
          ["activeRace.tier", 9],
          ["garage", "rocket"],
        ])
      ),
      verdictOn(
        edited(racing, [
          ["activeRace.bikeId", "rocket"],
          ["activeRace.started", false],
        ])
      ),
      verdictOn(
        edited(good, [
          ["qualified.1.ridge-road", 9],
          ["qualified.1.moon-road", 1],
        ])
      ),
      verdictOn(
        edited(racing, [
          ["gameOver", true],
          ["weaponHits", 5],
        ])
      ),
    ]).toStrictEqual([
      "invalid:weapon",
      "invalid:cash",
      "invalid:garage",
      "invalid:activeRace.started",
      "invalid:qualified.1.moon-road",
      "invalid:weaponHits",
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
      verdictOn(corrupted(good, "memory.nobody", 1)),
      verdictOn(corrupted(good, "season.nobody", blank)),
    ]).toStrictEqual([
      "invalid:qualified.1.moon-road",
      "invalid:memory.nobody",
      "invalid:season.nobody",
    ]);
  });

  it("a version 6 save is refused at the version, not read into version 7", () => {
    expect(verdictOn(versionSixOf(seasonAt(decent, 2).end))).toBe(
      "wrongVersion:version"
    );
  });

  it("a save written before a rival joined the game loads with blank rows for that rival", () => {
    const good = seasonAt(decent, 2).end;
    const before = parseJson(missing(good, "memory.juno-kade"));
    const result = parseCareer(
      JSON.stringify(withoutField(before, ["season", "juno-kade"]))
    );
    const fresh = newCareer(1);
    expect(
      result.ok && [
        result.career.memory["juno-kade"],
        result.career.season["juno-kade"],
        result.career.season.player,
      ]
    ).toStrictEqual([
      fresh.memory["juno-kade"],
      fresh.season["juno-kade"],
      good.season.player,
    ]);
  });

  it("a save that contradicts itself is rejected with the field that does not fit", () => {
    const racing = enter(seasonAt(decent, 2).start, "breakwater-run").career;
    const settled = seasonAt(decent, 2).end;
    const { starts } = settled.record;
    expect([
      verdictOn(corrupted(racing, "activeRace.bikeId", "ostra-nera-1000")),
      verdictOn(corrupted(racing, "gameOver", true)),
      verdictOn(corrupted(racing, "activeRace.raceId", 1)),
      verdictOn(corrupted(racing, "activeRace.tier", 1)),
      verdictOn(
        corrupted(settled, "activeRace", {
          bikeId: settled.bikeId,
          raceId: starts,
          roadId: "slag-row",
          seed: 1,
          started: true,
          tier: settled.tier,
        })
      ),
      verdictOn(corrupted(settled, "lastResult.summary.raceId", starts + 1)),
      verdictOn(corrupted(settled, "memory.juno-kade.sharedRace", starts + 1)),
      verdictOn(corrupted(settled, "bikeId", "ostra-nera-1000")),
    ]).toStrictEqual([
      "inconsistent:activeRace.bikeId",
      "inconsistent:gameOver",
      "inconsistent:activeRace.raceId",
      "inconsistent:activeRace.tier",
      "inconsistent:lastResult",
      "inconsistent:lastResult.summary.raceId",
      "inconsistent:memory.juno-kade",
      "inconsistent:garage",
    ]);
  });
});
