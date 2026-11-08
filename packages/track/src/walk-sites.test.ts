import { describe, expect, it } from "vitest";

import { roads, trackFor } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track } from "./track.ts";
import { NO_CROSSING, walkersOn } from "./walk-sites.ts";

const breakwater = trackFor("breakwater-run");

const seeded = (track: Track) =>
  track.walkSites.filter((site) => site.crossing === NO_CROSSING);

describe("walk sites", () => {
  it("puts a site on every zebra a road declares, with the crossing's marking", () => {
    for (const [index, crossing] of breakwater.crossings.entries()) {
      const declared = breakwater.walkSites.filter(
        (site) => site.crossing === index
      );
      expect(declared.length).toBeGreaterThan(0);
      expect(
        declared.every((site) => site.kind === crossing.walk)
      ).toBeTruthy();
    }
  });

  it("seeds unmarked crossings and jaywalkers clear of every crossing in a city region", () => {
    const sites = seeded(breakwater);
    const kinds = new Set(sites.map((site) => site.kind));
    expect(kinds).toStrictEqual(new Set(["unmarked", "jaywalk"]));
    for (const site of sites) {
      expect(
        breakwater.crossings.every(
          (crossing) => site.s < crossing.fromS || site.s > crossing.toS
        )
      ).toBeTruthy();
    }
  });

  it("seats a road's crowd along its stretch, on unmarked crossings with no lights", () => {
    const crowd = breakwater.walkSites.filter((site) =>
      site.id.startsWith("crowd-")
    );
    const [plan] = breakwater.plan.crowds;
    expect(plan).toBeDefined();
    expect(crowd).toHaveLength(plan?.sites ?? 0);
    for (const site of crowd) {
      expect(site.kind).toBe("unmarked");
      expect(site.crossing).toBe(NO_CROSSING);
      expect(site.s).toBeGreaterThanOrEqual(plan?.from ?? 0);
      expect(site.s).toBeLessThanOrEqual(plan?.to ?? 0);
    }
  });

  it("makes the Salt Coast busier without moving another city's sites", () => {
    expect(walkersOn(breakwater.walkSites)).toBe(59);
    expect(walkersOn(trackFor("slag-row").walkSites)).toBe(20);
  });

  it("gives a road with no city scenery nobody to meet", () => {
    expect(compileTrack(roads["ridge-road"]).walkSites).toStrictEqual([]);
  });

  it("refuses a crowd that is not a stretch of the road", () => {
    const plan = roads["breakwater-run"];
    for (const [from, to] of [
      [-400, -300],
      [1700, 1300],
      [Number.NaN, 1300],
      [8000, 90_000],
    ] as const) {
      expect(() =>
        compileTrack({ ...plan, crowds: [{ from, sites: 4, to }] })
      ).toThrow(`A crowd on ${plan.name} runs ${from} to ${to}`);
    }
  });

  it("refuses a crowd that is not a whole number of sites from 0 up", () => {
    const plan = roads["breakwater-run"];
    for (const sites of [2.5, -1, Number.NaN]) {
      expect(() =>
        compileTrack({ ...plan, crowds: [{ from: 1300, sites, to: 1740 }] })
      ).toThrow(`A crowd on ${plan.name} has ${sites} sites`);
    }
  });

  it("refuses a crowd on a crossing's reserved stretch, where its walkers would cross against the lights", () => {
    const plan = roads["breakwater-run"];
    const [harbour] = breakwater.crossings;
    expect(harbour?.id).toBe("harbour-cross");
    expect(() =>
      compileTrack({
        ...plan,
        crowds: [{ from: (harbour?.toS ?? 0) - 10, sites: 4, to: 1000 }],
      })
    ).toThrow(`over crossing "harbour-cross"`);
  });

  it("names each site once", () => {
    const ids = breakwater.walkSites.map((site) => site.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
