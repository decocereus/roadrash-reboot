import { describe, expect, it } from "vitest";

import { roads, trackFor } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track } from "./track.ts";
import { NO_CROSSING } from "./walk-sites.ts";

const breakwater = trackFor("breakwater-run", 5);

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

  it("gives a road with no city scenery nobody to meet", () => {
    expect(compileTrack(roads["ridge-road"].plan).walkSites).toStrictEqual([]);
  });

  it("keeps the same places as the level rises and only adds to them", () => {
    const low = seeded(trackFor("breakwater-run", 1));
    const high = seeded(breakwater);
    expect(low.length).toBeLessThan(high.length);
    for (const site of low) {
      expect(high).toContainEqual(site);
    }
  });

  it("names each site once", () => {
    const ids = breakwater.walkSites.map((site) => site.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
