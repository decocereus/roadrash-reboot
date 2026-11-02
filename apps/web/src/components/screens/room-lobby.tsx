import type { SeatPhase } from "@racer/rooms/seat-client";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";
import { useState } from "react";

const ridersLine = (riders: number, names: readonly string[]): string => {
  const others = riders - names.length;
  const count = riders === 1 ? "1 rider" : `${riders} riders`;
  const more = others > 0 ? ` and ${others} more` : "";
  return `${count} here: ${names.join(", ")}${more}.`;
};

const statusOf = (
  phase: SeatPhase,
  riders: number,
  names: readonly string[],
  refusal: string | null
): string => {
  switch (phase) {
    case "connecting": {
      return "Finding the room.";
    }
    case "lobby": {
      return ridersLine(riders, names);
    }
    case "loading": {
      return "Loading the race. The countdown starts when everyone is ready.";
    }
    case "racing": {
      return "Rolling out.";
    }
    case "ended": {
      return "This race is over.";
    }
    case "left": {
      return "You left this room.";
    }
    case "lost": {
      return "Reconnecting to the room.";
    }
    case "refused": {
      return refusal === "full"
        ? "This room is full."
        : "This race has already started.";
    }
    default: {
      return phase satisfies never;
    }
  }
};

interface LobbyActions {
  readonly onBack: () => void;
  readonly onChangeName: () => void;
  readonly onCopyLink: () => void;
  readonly onStart: () => void;
}

const lobbyAction = (id: string, actions: LobbyActions): void => {
  if (id === "start") {
    actions.onStart();
  } else if (id === "copy") {
    actions.onCopyLink();
  } else if (id === "name") {
    actions.onChangeName();
  } else {
    actions.onBack();
  }
};

export const GuestNameScreen = ({
  onBack,
  onName,
}: {
  readonly onBack: () => void;
  readonly onName: (name: string) => void;
}) => {
  const [typed, setTyped] = useState("");
  return (
    <Screen className="bg-ink">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <form
          className="flex flex-col items-center gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onName(typed);
          }}
        >
          <label className="font-display text-quote text-paper" htmlFor="guest">
            What do they call you?
          </label>
          <input
            autoComplete="nickname"
            autoFocus
            className="font-display text-quote border-paper text-paper border-b bg-transparent text-center"
            id="guest"
            maxLength={12}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            required
            value={typed}
          />
          <button className="font-display text-paper" type="submit">
            Ride
          </button>
        </form>
        <button
          className="font-display text-paper/60"
          onClick={onBack}
          type="button"
        >
          Leave
        </button>
      </div>
    </Screen>
  );
};

export const RoomLobbyScreen = ({
  copied,
  name,
  phase,
  raceId,
  refusal,
  requeued,
  riderNames,
  riders,
  startsInSeconds,
  onBack,
  onChangeName,
  onCopyLink,
  onStart,
}: {
  readonly copied: boolean;
  readonly name: string;
  readonly phase: SeatPhase;
  readonly raceId: string;
  readonly refusal: string | null;
  readonly requeued: boolean;
  readonly riderNames: readonly string[];
  readonly riders: number;
  readonly startsInSeconds: number;
  readonly onBack: () => void;
  readonly onChangeName: () => void;
  readonly onCopyLink: () => void;
  readonly onStart: () => void;
}) => (
  <Screen className="bg-ink">
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Stencil>{raceId}</Stencil>
      <p aria-live="polite" className="font-display text-quote text-paper">
        {statusOf(phase, riders, riderNames, refusal)}
      </p>
      {phase === "lobby" && (
        <p className="font-display text-paper">
          {requeued
            ? "The last room dropped. A new race starts from the line."
            : `Rolling out in ${startsInSeconds} s.`}
        </p>
      )}
      <p className="font-display text-paper/60">
        Riding as {name}. {copied && "Link copied."}
      </p>
      <MenuList
        key={phase}
        autoFocus
        defaultValue={phase === "lobby" ? "start" : "back"}
        label="Room"
        onSelect={(id) => {
          lobbyAction(id, { onBack, onChangeName, onCopyLink, onStart });
        }}
      >
        {phase === "lobby" && <MenuItem value="start">Start the race</MenuItem>}
        {phase === "lobby" && <MenuItem value="copy">Copy the link</MenuItem>}
        {phase === "lobby" && <MenuItem value="name">Change name</MenuItem>}
        <MenuItem value="back">Leave</MenuItem>
      </MenuList>
    </div>
  </Screen>
);
