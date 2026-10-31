import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import {
  crossLightOf,
  isSignalled,
  mainLightOf,
  signalPhaseAt,
} from "./signals.ts";
import type { LightColour, SignalledCrossing } from "./signals.ts";

const CYCLE_TICKS = 1380;

const open = (colour: LightColour) => colour !== "red";

const signalled = (id: string): SignalledCrossing => {
  const crossing = trackFor("breakwater-run", 1).crossings.find(
    (each) => each.id === id
  );
  if (!(crossing && isSignalled(crossing))) {
    throw new Error(`Breakwater Run has no signalled crossing "${id}".`);
  }
  return crossing;
};

const lightsOver = (crossing: SignalledCrossing, ticks: number) => {
  const main: LightColour[] = [];
  const cross: LightColour[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const phase = signalPhaseAt(crossing, tick);
    main.push(mainLightOf(phase));
    cross.push(crossLightOf(phase));
  }
  return { cross, main };
};

describe("junction lights", () => {
  it("the main road and the cross road are never both open, and both are red for a second between them", () => {
    const { cross, main } = lightsOver(signalled("harbour-cross"), CYCLE_TICKS);
    expect(
      main.some((colour, tick) => open(colour) && open(cross[tick] ?? "red"))
    ).toBeFalsy();
    const bothRed = main.filter(
      (colour, tick) => colour === "red" && cross[tick] === "red"
    );
    expect(bothRed).toHaveLength(120);
  });

  it("a rider meets a red at a junction about half the time and the cycle repeats every 23 s", () => {
    const crossing = signalled("harbour-cross");
    const { main } = lightsOver(crossing, CYCLE_TICKS * 2);
    const red = main.slice(0, CYCLE_TICKS).filter((colour) => colour === "red");
    expect(red.length / CYCLE_TICKS).toBeCloseTo(0.5, 1);
    expect(main.slice(CYCLE_TICKS)).toStrictEqual(main.slice(0, CYCLE_TICKS));
    expect(main.slice(0, 3)).toStrictEqual(["green", "green", "green"]);
  });

  it("each junction runs its own offset, so two junctions are not red together all the time", () => {
    const harbour = lightsOver(signalled("harbour-cross"), CYCLE_TICKS).main;
    const market = lightsOver(signalled("market-cross"), CYCLE_TICKS).main;
    expect(market).not.toStrictEqual(harbour);
  });

  it("an offset behind the race clock runs the same cycle as the offset a whole cycle later", () => {
    const harbour = signalled("harbour-cross");
    const behind = { ...harbour, lights: { offsetTicks: -60 } };
    const ahead = { ...harbour, lights: { offsetTicks: CYCLE_TICKS - 60 } };
    expect(lightsOver(behind, 2 * CYCLE_TICKS)).toStrictEqual(
      lightsOver(ahead, 2 * CYCLE_TICKS)
    );
    expect(signalPhaseAt(behind, 0)).toBe("crossClear");
  });
});
