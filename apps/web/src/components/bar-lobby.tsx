import { roads } from "@racer/career/tables";
import type { RoomLobbyMessage } from "@racer/rooms/messages";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { cn } from "@racer/ui/utils";
import { useEffect, useEffectEvent } from "react";
import type { MouseEvent } from "react";

import { BarStage } from "./bar-stage.tsx";

const READY_KEY = "Enter";
const buttonLook =
  "cursor-pointer rounded px-3 py-1 font-bold tracking-wide uppercase";

interface BarLobbyProps {
  readonly copied: boolean;
  readonly lobby: RoomLobbyMessage;
  readonly onBack: () => void;
  readonly onCopyLink: () => void;
  readonly seat: RoomSeat;
  readonly startsInSeconds: number | null;
}

const blurred =
  (act: () => void) =>
  (event: MouseEvent<HTMLButtonElement>): void => {
    event.currentTarget.blur();
    act();
  };

export const BarLobby = ({
  copied,
  lobby,
  onBack,
  onCopyLink,
  seat,
  startsInSeconds,
}: BarLobbyProps) => {
  const ready =
    lobby.members.find((member) => member.id === lobby.you)?.ready === true;
  const toggle = useEffectEvent(() => {
    seat.setReady(!ready);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === READY_KEY && !event.repeat && !seat.race()) {
        toggle();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [seat]);
  if (seat.race()) {
    return <BarStage seat={seat} />;
  }
  return (
    <BarStage seat={seat}>
      <aside
        aria-label="This lobby"
        className="bg-ink/85 font-display text-paper absolute top-4 right-4 flex w-64 flex-col gap-2 rounded-md p-3"
      >
        <p className="font-bold tracking-wide uppercase">
          {roads[lobby.rule.roadId].name}
        </p>
        <ul>
          {lobby.members.map((member) => (
            <li
              className={cn(
                "flex justify-between tracking-wide uppercase",
                !member.here && "opacity-50"
              )}
              key={member.id}
            >
              <span>{member.name}</span>
              {member.ready && <span className="text-neon-yellow">Ready</span>}
            </li>
          ))}
        </ul>
        {startsInSeconds !== null && (
          <p className="tracking-wide uppercase">
            Door opens in {startsInSeconds}
          </p>
        )}
        <button
          aria-pressed={ready}
          className={cn(
            buttonLook,
            ready
              ? "text-paper border-paper/40 border"
              : "bg-neon-yellow text-ink"
          )}
          onClick={blurred(toggle)}
          tabIndex={-1}
          type="button"
        >
          {ready ? "Not ready" : "Ready"} (Enter)
        </button>
        <div className="flex gap-2">
          <button
            className={cn(buttonLook, "text-paper grow")}
            onClick={blurred(onCopyLink)}
            tabIndex={-1}
            type="button"
          >
            {copied ? "Copied" : "Invite"}
          </button>
          <button
            className={cn(buttonLook, "text-paper grow")}
            onClick={blurred(onBack)}
            tabIndex={-1}
            type="button"
          >
            Leave
          </button>
        </div>
      </aside>
    </BarStage>
  );
};
