import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it, vi } from "vitest";

import { releaseAll } from "./dispose.ts";
import { attractOn } from "./game-session.ts";
import { bindFeedback, createFeedback } from "./race-feedback.ts";

describe(bindFeedback, () => {
  it("silences the race's engine and wind when the game is released", () => {
    const track = trackFor("ridge-road");
    const race = createRaceRun(defaultSetup(track, 7));
    const hush = vi.fn<() => void>();
    const owners: (() => void)[] = [];
    bindFeedback({
      chase: { bump: vi.fn<() => void>(), jolt: vi.fn<() => void>() },
      drawnSpeed: () => 0,
      events: { onHud: vi.fn<() => void>() },
      feedback: createFeedback(),
      owners,
      player: () => {
        const me = riderOf(race.view.riders, PLAYER_RIDER);
        if (!me) {
          throw new Error("The race has no player.");
        }
        return me;
      },
      recorder: { race: vi.fn<() => void>() },
      session: () => attractOn(0),
      sound: {
        hush,
        muted: () => false,
        play: vi.fn<() => void>(),
        toggleMute: vi.fn<() => void>(),
      },
      stage: { colours: new Map(), me: PLAYER_RIDER, race, track },
    });
    expect(hush).not.toHaveBeenCalled();
    releaseAll(owners);
    expect(hush).toHaveBeenCalledOnce();
  });
});
