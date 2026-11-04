import type { Refusal } from "@racer/rooms/messages";
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

const refusalLine = (refusal: Refusal): string => {
  switch (refusal) {
    case "build":
    case "content": {
      return "The game has updated. Reload to join.";
    }
    case "full": {
      return "This room is full.";
    }
    case "racing": {
      return "This race has already started.";
    }
    default: {
      return refusal satisfies never;
    }
  }
};

const statusOf = (
  phase: SeatPhase,
  riders: number,
  names: readonly string[],
  refusal: Refusal | null
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
      return refusal ? refusalLine(refusal) : "This seat was refused.";
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
}

const lobbyAction = (id: string, actions: LobbyActions): void => {
  if (id === "reload") {
    globalThis.location.reload();
  } else if (id === "copy") {
    actions.onCopyLink();
  } else if (id === "name") {
    actions.onChangeName();
  } else {
    actions.onBack();
  }
};

const mustReload = (refusal: Refusal | null): boolean =>
  refusal === "build" || refusal === "content";

const defaultItem = (phase: SeatPhase, refusal: Refusal | null): string => {
  if (phase === "lobby") {
    return "copy";
  }
  return mustReload(refusal) ? "reload" : "back";
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
  roomId,
  refusal,
  requeued,
  riderNames,
  riders,
  startsInSeconds,
  onBack,
  onChangeName,
  onCopyLink,
}: {
  readonly copied: boolean;
  readonly name: string;
  readonly phase: SeatPhase;
  readonly roomId: string;
  readonly refusal: Refusal | null;
  readonly requeued: boolean;
  readonly riderNames: readonly string[];
  readonly riders: number;
  readonly startsInSeconds: number;
  readonly onBack: () => void;
  readonly onChangeName: () => void;
  readonly onCopyLink: () => void;
}) => (
  <Screen className="bg-ink">
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Stencil>{roomId}</Stencil>
      <p aria-live="polite" className="font-display text-quote text-paper">
        {statusOf(phase, riders, riderNames, refusal)}
      </p>
      {phase === "lobby" && (
        <p className="font-display text-paper">
          {requeued && "The last room dropped. "}
          Rolling out in {startsInSeconds} s.
        </p>
      )}
      <p className="font-display text-paper/60">
        Riding as {name}. {copied && "Link copied."}
      </p>
      <MenuList
        key={phase}
        autoFocus
        defaultValue={defaultItem(phase, refusal)}
        label="Room"
        onSelect={(id) => {
          lobbyAction(id, { onBack, onChangeName, onCopyLink });
        }}
      >
        {mustReload(refusal) && <MenuItem value="reload">Reload</MenuItem>}
        {phase === "lobby" && <MenuItem value="copy">Copy the link</MenuItem>}
        {phase === "lobby" && <MenuItem value="name">Change name</MenuItem>}
        <MenuItem value="back">Leave</MenuItem>
      </MenuList>
    </div>
  </Screen>
);
