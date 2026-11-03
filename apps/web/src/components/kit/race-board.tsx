import { useState } from "react";

import { gameOverPlates } from "../../assets/clubhouse-art.ts";
import { createHudFeed, idleHud } from "../../hud-feed.ts";
import { Plate } from "../screens/clubhouse-stage.tsx";
import { RaceHud } from "../screens/race-hud.tsx";
import { KitBoard } from "./kit-board.tsx";

const BACKDROP = { h: 941, w: 1672, x: 0, y: 0 } as const;

export const RaceBoard = () => {
  const [feed] = useState(() => {
    const made = createHudFeed();
    made.write({
      ...idleHud,
      copGap: 42,
      gear: 4,
      notice: "knockdown",
      phase: "racing",
      position: 3,
      progress: 0.4,
      riderCount: 8,
      speedKmh: 184,
    });
    return made;
  });
  return (
    <KitBoard
      note="Race type sits on the road, so it uses hud-ink outlines instead of paper."
      title="Race"
    >
      <Plate
        box={BACKDROP}
        className="object-cover opacity-70"
        src={gameOverPlates.backdrop}
      />
      <div className="absolute inset-0 [contain:paint]">
        <RaceHud feed={feed} settled={false} />
      </div>
    </KitBoard>
  );
};
