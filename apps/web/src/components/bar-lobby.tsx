import type { RoomLobbyMessage } from "@racer/rooms/messages";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { Stencil } from "@racer/ui/components/stencil";
import { cn } from "@racer/ui/utils";
import { useEffect, useEffectEvent, useState } from "react";

import { BarStage } from "./bar-stage.tsx";
import {
  MemberRows,
  RuleChoices,
  RuleLines,
  startLine,
} from "./screens/room-lobby.tsx";

const READY_KEY = "Enter";
const BUTTON = "cursor-pointer rounded px-3 py-1 tracking-wide uppercase";

interface BarLobbyProps {
  readonly copied: boolean;
  readonly lobby: RoomLobbyMessage;
  readonly name: string;
  readonly onBack: () => void;
  readonly onChangeName: () => void;
  readonly onCopyLink: () => void;
  readonly roomId: string;
  readonly seat: RoomSeat;
  readonly startsInSeconds: number | null;
}

export const BarLobby = ({
  copied,
  lobby,
  name,
  onBack,
  onChangeName,
  onCopyLink,
  roomId,
  seat,
  startsInSeconds,
}: BarLobbyProps) => {
  const [showRules, setShowRules] = useState(false);
  const ready =
    lobby.members.find((member) => member.id === lobby.you)?.ready === true;
  const gathering = lobby.phase === "gathering";
  const hosting = lobby.hostId === lobby.you && gathering;
  const toggleReady = useEffectEvent(() => {
    if (gathering && !seat.race()) {
      seat.setReady(!ready);
    }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.code === READY_KEY &&
        !event.repeat &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        toggleReady();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);
  if (seat.race()) {
    return <BarStage seat={seat} />;
  }
  return (
    <BarStage seat={seat}>
      <aside
        aria-label="This lobby"
        className="bg-ink/90 font-display text-paper absolute top-4 right-4 flex max-h-[calc(100%-2rem)] w-96 max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto rounded-md p-4"
        onPointerDown={(event) => {
          event.preventDefault();
        }}
      >
        <Stencil className="text-4xl">
          {lobby.roomKind === "public" ? "Public lobby" : roomId}
        </Stencil>
        <MemberRows lobby={lobby} />
        <p aria-live="polite">{startLine(lobby.phase, startsInSeconds)}</p>
        <p className="text-paper/60">
          Riding as {name}. {copied && "Link copied."}
        </p>
        {gathering && (
          <button
            aria-pressed={ready}
            className={cn(
              BUTTON,
              "font-bold",
              ready ? "border-paper/40 border" : "bg-neon-yellow text-ink"
            )}
            onClick={toggleReady}
            type="button"
          >
            {ready ? "Not ready" : "Ready"}
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {lobby.roomKind === "custom" && (
            <button className={BUTTON} onClick={onCopyLink} type="button">
              Copy the link
            </button>
          )}
          <button
            aria-expanded={showRules}
            className={BUTTON}
            onClick={() => {
              setShowRules(!showRules);
            }}
            type="button"
          >
            {hosting ? "You set the rules" : "The rules"}
          </button>
          <button className={BUTTON} onClick={onChangeName} type="button">
            Change name
          </button>
          <button className={BUTTON} onClick={onBack} type="button">
            Leave
          </button>
        </div>
        {showRules &&
          (hosting ? (
            <RuleChoices onChoose={seat.choose} rule={lobby.rule} />
          ) : (
            <RuleLines rule={lobby.rule} />
          ))}
      </aside>
    </BarStage>
  );
};
