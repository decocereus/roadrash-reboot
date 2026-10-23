import { TICK_SECONDS } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { advanceHud } from "../src/game/hud-cadence.ts";
import { createHudFeed, idleHud } from "../src/hud-feed.ts";
import { createHost, VSYNC_MS } from "./hosts.ts";

const samples = (count: number, seconds: number): number[] =>
  Array.from({ length: count }, () => seconds);

const multiples = (step: number, last: number): number[] =>
  Array.from({ length: last / step }, (_, index) => (index + 1) * step);

const publishedOn = (frames: readonly number[]): number[] => {
  const clock = { hudClock: 0 };
  const published: number[] = [];
  for (const [index, seconds] of frames.entries()) {
    advanceHud(clock, seconds, () => {
      published.push(index + 1);
    });
  }
  return published;
};

describe("the HUD publishes once per 1/15 s of processed frame time", () => {
  it("publishes on samples 4, 8, …, 60 of a second of 1/60 s ticks, through the real feed", () => {
    const feed = createHudFeed();
    const clock = { hudClock: 0 };
    const published: number[] = [];
    let notified = 0;
    const unsubscribe = feed.subscribe(() => {
      notified += 1;
    });
    const drive = (from: number, to: number) => {
      for (let sample = from; sample <= to; sample += 1) {
        advanceHud(clock, TICK_SECONDS, () => {
          published.push(sample);
          feed.write({ ...idleHud, progress: sample / 60 });
        });
      }
    };
    drive(1, 3);
    expect({ notified, published }).toStrictEqual({
      notified: 0,
      published: [],
    });
    drive(4, 60);
    expect({
      notified,
      progress: feed.read().progress,
      published,
    }).toStrictEqual({
      notified: 15,
      progress: 1,
      published: multiples(4, 60),
    });
    unsubscribe();
    feed.write(idleHud);
    expect({ notified, read: feed.read() }).toStrictEqual({
      notified: 15,
      read: idleHud,
    });
  });

  it("keeps publishing every fourth tick for five seconds", () => {
    expect(publishedOn(samples(300, TICK_SECONDS))).toStrictEqual(
      multiples(4, 300)
    );
  });

  it("publishes 15 times a second when frames come at 30 or 120 per second", () => {
    expect(publishedOn(samples(30, 1 / 30))).toStrictEqual(multiples(2, 30));
    expect(publishedOn(samples(120, 1 / 120))).toStrictEqual(multiples(8, 120));
  });

  it("drops what a long frame carries past the interval", () => {
    const long = 0.09;
    expect(publishedOn([long, ...samples(3, TICK_SECONDS)])).toStrictEqual([1]);
    expect(publishedOn([long, ...samples(4, TICK_SECONDS)])).toStrictEqual([
      1, 5,
    ]);
  });

  it("leaves the clock alone when an event publishes at once", () => {
    const feed = createHudFeed();
    const clock = { hudClock: 0 };
    const regular: number[] = [];
    let notified = 0;
    feed.subscribe(() => {
      notified += 1;
    });
    const drive = (from: number, to: number) => {
      for (let sample = from; sample <= to; sample += 1) {
        advanceHud(clock, TICK_SECONDS, () => {
          regular.push(sample);
          feed.write({ ...idleHud, muted: true, progress: sample });
        });
      }
    };
    drive(1, 1);
    feed.write({ ...idleHud, muted: true });
    expect(notified).toBe(1);
    expect(regular).toStrictEqual([]);
    expect(clock.hudClock).toBe(TICK_SECONDS);
    drive(2, 8);
    expect(regular).toStrictEqual([4, 8]);
    expect(notified).toBe(3);
  });
});

describe("the frame loop feeds the HUD clock", () => {
  it("counts a long gap as one clamped 0.1 s frame with one publication", () => {
    const host = createHost();
    for (let frame = 1; frame <= 30; frame += 1) {
      host.at(frame * VSYNC_MS);
    }
    const before = host.seen.reports;
    host.at(30 * VSYNC_MS + 500);
    expect(host.seen.reports).toBe(before + 1);
    expect(host.frame.hudClock).toBe(0);
  });

  it("publishes nothing and keeps its clock while the loop is halted", () => {
    const host = createHost();
    for (let frame = 1; frame <= 30; frame += 1) {
      host.at(frame * VSYNC_MS);
    }
    const { reports } = host.seen;
    const clock = host.frame.hudClock;
    expect(reports).toBeGreaterThan(0);
    host.halt(true);
    for (let frame = 31; frame <= 90; frame += 1) {
      host.at(frame * VSYNC_MS);
    }
    expect(host.seen.reports).toBe(reports);
    expect(host.frame.hudClock).toBe(clock);
    host.halt(false);
    for (let frame = 91; frame <= 150; frame += 1) {
      host.at(frame * VSYNC_MS);
    }
    expect(host.seen.reports).toBeGreaterThan(reports);
  });
});
