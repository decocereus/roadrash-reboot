import type { CareerState } from "@racer/career/state";
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { useState } from "react";

import { backRoomPlates, plates } from "../../assets/clubhouse-art.ts";
import { CONTROLS, SAVE_UNREAD, saveErrors } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import type { SaveState } from "../../career/save.ts";
import { BarHeader, BarStrip } from "./bar-chrome.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { Confirm } from "./confirm.tsx";
import { PinnedList } from "./pinned-list.tsx";
import { SettingsScreen } from "./settings.tsx";
import { useEscape } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

const BACKDROP = { h: 941, w: 1672, x: 0, y: 0 } as const;
const NOTE = { h: 270, w: 456, x: 560, y: 150 } as const;
const NOTE_TEXT = { h: 175, w: 264, x: 595, y: 204 } as const;

const careerActions = (
  career: CareerState,
  onContinue: () => void,
  askNew: () => void
): MenuAction[] => {
  if (career.gameOver) {
    return [
      {
        detail: "See the record",
        id: "continue",
        label: "Career over",
        run: onContinue,
      },
      { id: "new", label: "New career", run: askNew },
    ];
  }
  if (career.story.ending !== null) {
    return [
      {
        detail: "See the ending",
        id: "continue",
        label: "Season over",
        run: onContinue,
      },
      { id: "new", label: "New career", run: askNew },
    ];
  }
  return [
    {
      detail: `Tier ${career.tier}, ${formatMoney(career.cash)}, ${bikeName(career.bikeId)}`,
      id: "continue",
      label: "Back to the bar",
      run: onContinue,
    },
    { id: "new", label: "New career", run: askNew },
  ];
};

const Alert = ({
  save,
  failure,
}: {
  readonly save: SaveState;
  readonly failure: string;
}) => {
  if (save.status !== "corrupt" && save.status !== "unread" && failure === "") {
    return null;
  }
  return (
    <>
      <Plate box={NOTE} src={plates.noteMagenta} />
      <div
        className="font-display text-ink flex -rotate-2 flex-col justify-center gap-[0.4em] leading-tight font-bold"
        role="alert"
        style={{ ...place(NOTE_TEXT), fontSize: stagePx(19) }}
      >
        {save.status === "corrupt" && (
          <>
            <p>
              {saveErrors[save.error.kind]}
              {save.error.field === "" ? "." : ` (${save.error.field}).`}
            </p>
            <p className="text-ink/70 text-[0.8em]">
              Save error: {save.error.kind}. Start over keeps the old save in
              the browser under a backup key and begins a new career.
            </p>
          </>
        )}
        {save.status === "unread" && <p>{SAVE_UNREAD}</p>}
        {failure !== "" && <p>Could not start the game: {failure}</p>}
      </div>
    </>
  );
};

const overlays = ["nothing", "settings", "erase"] as const;

type Overlay = (typeof overlays)[number];

export const BackRoomScreen = ({
  save,
  failure,
  onContinue,
  onNewCareer,
  onQuickRace,
  onStartOver,
}: {
  readonly save: SaveState;
  readonly failure: string;
  readonly onContinue: () => void;
  readonly onNewCareer: () => void;
  readonly onQuickRace: () => void;
  readonly onStartOver: () => void;
}) => {
  const [overlay, setOverlay] = useState<Overlay>("nothing");
  const quick: MenuAction[] = [
    {
      detail: "Any road, no money at stake",
      id: "quick",
      label: "Single race",
      run: onQuickRace,
    },
    {
      id: "settings",
      label: "Settings",
      run: () => {
        setOverlay("settings");
      },
    },
  ];
  const tryAgain: MenuAction = {
    id: "continue",
    label: "Try again",
    run: () => {
      globalThis.location.reload();
    },
  };
  const menu = (): MenuAction[] => {
    switch (save.status) {
      case "ready": {
        return [
          ...careerActions(save.career, onContinue, () => {
            setOverlay("erase");
          }),
          ...quick,
        ];
      }
      case "corrupt": {
        return [
          { id: "continue", label: "Start over", run: onStartOver },
          ...quick,
        ];
      }
      case "unread": {
        return [tryAgain, ...quick];
      }
      case "empty": {
        return [
          { id: "continue", label: "Career", run: onNewCareer },
          ...quick,
        ];
      }
      case "loading": {
        return [tryAgain];
      }
      case "elsewhere": {
        return [];
      }
      default: {
        return save satisfies never;
      }
    }
  };
  useEscape(onContinue, save.status === "ready" && overlay === "nothing");
  return (
    <Screen className="bg-ink flex" enter="fade">
      <Stage inert={overlay === "nothing" ? undefined : true}>
        <Plate
          box={BACKDROP}
          className="object-cover"
          src={backRoomPlates.backdrop}
        />
        <BarHeader career={save.status === "ready" ? save.career : null} />
        {save.status !== "elsewhere" && (
          <PinnedList
            actions={menu()}
            autoFocus={overlay !== "settings"}
            label="Back room"
            primary="continue"
            title="Back room"
          />
        )}
        <Alert failure={failure} save={save} />
        <BarStrip>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            {CONTROLS}
          </p>
        </BarStrip>
      </Stage>
      {overlay === "settings" && (
        <SettingsScreen
          onBack={() => {
            setOverlay("nothing");
          }}
        />
      )}
      {overlay === "erase" && save.status === "ready" && (
        <Confirm
          defaultValue="keep"
          label="Start over"
          onDismiss={() => {
            setOverlay("nothing");
          }}
          onSelect={(value) => {
            setOverlay("nothing");
            if (value === "erase") {
              onNewCareer();
            }
          }}
          options={[
            { label: "Keep it", value: "keep" },
            { label: "Erase and start", value: "erase" },
          ]}
        >
          Start over? Your Tier {save.career.tier} career will be erased.
        </Confirm>
      )}
    </Screen>
  );
};
