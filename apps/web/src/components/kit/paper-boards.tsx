import { recordedRules } from "@racer/career/bench";
import { practiceCareer } from "@racer/career/field";
import { seasonBoard } from "@racer/career/season";
import { cn } from "@racer/ui/utils";
import { useState } from "react";

import { plates } from "../../assets/clubhouse-art.ts";
import { firstQuickPick } from "../../career/flow.ts";
import { BarHeader, BarNav, BarStrip } from "../screens/bar-chrome.tsx";
import { SpeechSticker } from "../screens/clubhouse-bar.tsx";
import { place, stagePx } from "../screens/clubhouse-stage.tsx";
import {
  Standings,
  stampStyle,
  WallNotes,
  WrittenSheet,
} from "../screens/clubhouse-wall.tsx";
import { Confirm } from "../screens/confirm.tsx";
import { PinnedList } from "../screens/pinned-list.tsx";
import { KitBoard } from "./kit-board.tsx";

const career = practiceCareer(firstQuickPick, 1);
const SHEET = { h: 691, w: 470, x: 560, y: 110 } as const;
const STAMP = { h: 146, w: 500, x: 1110, y: 640 } as const;
const LEVELS = ["1", "2", "3", "4", "5"] as const;

export const ChromeBoard = () => {
  const [level, setLevel] = useState(0);
  const [picked, setPicked] = useState("nothing yet");
  const pick = (label: string) => () => {
    setPicked(label);
  };
  return (
    <KitBoard
      note="Every bar-side screen: the header, a pinned list on the left, a written sheet, and the strip along the bottom. The pinned list takes steppers, details, and a compact one-line mode."
      title="Bar chrome and sheets"
    >
      <BarHeader standing={{ career, rules: recordedRules }} />
      <PinnedList
        actions={[
          {
            detail: "Ridge Road at level 1",
            id: "race",
            label: "Race",
            run: pick("Race"),
          },
          {
            detail: "Locked",
            disabled: true,
            id: "gone",
            label: "Sold out",
            run: pick("Sold out"),
          },
          { id: "back", label: "Back", run: pick("Back") },
        ]}
        autoFocus={false}
        label="Kit list"
        primary="race"
        steppers={[
          {
            id: "level",
            label: "Level",
            onStep: (step) => {
              setLevel((LEVELS.length + level + step) % LEVELS.length);
            },
            value: LEVELS[level],
          },
        ]}
        title="Pinned list"
      />
      <WrittenSheet
        box={SHEET}
        scale={0.75}
        text="A written sheet sets prose on the ruled lines of the standings plate. The tape carries the title."
        title="Written sheet"
      />
      <PinnedList
        actions={[
          { id: "one", label: "Compact", run: pick("Compact") },
          { id: "two", label: "One line", run: pick("One line") },
          { id: "three", label: "Each", run: pick("Each") },
        ]}
        autoFocus={false}
        compact
        label="Compact list"
        left={1100}
        primary="one"
        title="Compact"
      />
      <BarNav
        actions={[
          { id: "go", label: "Strip action", run: pick("Strip action") },
          {
            disabled: true,
            id: "off",
            label: "Disabled",
            run: pick("Disabled"),
          },
        ]}
        autoFocus={false}
        label="Kit strip"
        primary="go"
      >
        <p
          className="text-paper/60 tracking-wide"
          style={{ fontSize: stagePx(20) }}
        >
          Picked: {picked}
        </p>
      </BarNav>
    </KitBoard>
  );
};

export const WallBoard = () => (
  <KitBoard
    note="Pieces pinned to the clubhouse wall: standings, the cyan and magenta notes, a stamp, and the speech sticker in both directions."
    title="Wall pieces"
  >
    <div
      className="absolute inset-0"
      style={{ backgroundImage: `url(${plates.wall})`, backgroundSize: "60%" }}
    />
    <Standings playerCaption="Two to qualify" rows={seasonBoard(career)} />
    <WallNotes
      notes={[
        { signature: "— Vex", text: "Ridge Road tonight. Bring a lock." },
        { text: "Cops on the coast after ten" },
      ]}
    />
    <SpeechSticker
      speech={{
        line: "You ride like the bill is already paid.",
        name: "Vex",
        tag: "Road boss",
      }}
    />
    <SpeechSticker
      at={{ x: 1200, y: 160 }}
      flip
      speech={{
        line: "Flipped, for the right-hand seat.",
        name: "Mags",
        tag: undefined,
      }}
    />
    <div
      className="font-display flex items-center justify-center font-bold uppercase"
      style={place(STAMP)}
    >
      <p
        className={cn(
          stampStyle,
          "bg-ink/80 text-neon-yellow border-neon-yellow -rotate-6"
        )}
        style={{ fontSize: stagePx(64) }}
      >
        Season over
      </p>
    </div>
  </KitBoard>
);

export const ConfirmBoard = () => {
  const [open, setOpen] = useState(false);
  return (
    <KitBoard
      note="Confirm pins a ruled slip over the dimmed room. Escape or the safe choice closes it, and focus goes back to the opener."
      title="Confirm"
    >
      <BarHeader standing={{ career, rules: recordedRules }} />
      <BarStrip>
        <button
          className="font-display text-neon-yellow cursor-pointer uppercase"
          onClick={() => {
            setOpen(true);
          }}
          type="button"
        >
          Open the slip
        </button>
      </BarStrip>
      {open && (
        <Confirm
          defaultValue="keep"
          label="Start over"
          onDismiss={() => {
            setOpen(false);
          }}
          onSelect={() => {
            setOpen(false);
          }}
          options={[
            { label: "Keep riding", value: "keep" },
            { label: "Start over", value: "wipe" },
          ]}
          warning="This wipes the save"
        >
          Burn the career and start again with the first bike?
        </Confirm>
      )}
    </KitBoard>
  );
};
