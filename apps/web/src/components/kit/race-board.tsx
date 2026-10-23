import { useState } from "react";

import { gameOverPlates } from "../../assets/clubhouse-art.ts";
import { createHudFeed, idleHud } from "../../hud-feed.ts";
import { Plate } from "../screens/clubhouse-stage.tsx";
import { RaceHud } from "../screens/race-hud.tsx";
import { KitBoard } from "./kit-board.tsx";

const BACKDROP = { h: 941, w: 1672, x: 0, y: 0 } as const;

const showTag = (tag: HTMLDivElement | null) => {
  if (tag) {
    tag.style.visibility = "visible";
    tag.style.transform = "translate(62cqw, 14cqw)";
  }
};

export const RaceBoard = () => {
  const [feed] = useState(() => {
    const made = createHudFeed();
    made.write({
      ...idleHud,
      copDistance: 42,
      gear: 4,
      notice: "knockdown",
      phase: "racing",
      position: 3,
      progress: 0.4,
      riderCount: 8,
      rivalColour: "#ff2fb5",
      rivalName: "Vex",
      speech: "Get off my road.",
      speedKmh: 184,
    });
    return made;
  });
  return (
    <KitBoard
      note="Race type sits on the road, so it uses hud-ink outlines instead of paper. The rival taunt rides the speech sticker."
      title="Race"
    >
      <Plate
        box={BACKDROP}
        className="object-cover opacity-70"
        src={gameOverPlates.backdrop}
      />
      <div className="absolute inset-0 [contain:paint]">
        <RaceHud feed={feed} settled={false} tagRef={showTag} />
      </div>
    </KitBoard>
  );
};
