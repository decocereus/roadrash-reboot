import type { RoomLobbyMessage } from "@racer/rooms/messages";
import type { RoomSeat } from "@racer/rooms/seat-client";
import {
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { useEffect, useEffectEvent, useState } from "react";

import { keptByControl } from "../key-target.ts";
import {
  MemberRows,
  RuleChoices,
  RuleLines,
  startLine,
} from "./screens/room-lobby.tsx";

const READY_KEY = "Enter";

interface LobbyPartProps {
  readonly copied: boolean;
  readonly lobby: RoomLobbyMessage;
  readonly onLeave: () => void;
  readonly onCopyLink: () => void;
  readonly roomId: string;
  readonly seat: RoomSeat;
  readonly shown: boolean;
  readonly startsInSeconds: number | null;
}

export const LobbyPart = ({
  copied,
  lobby,
  onLeave,
  onCopyLink,
  roomId,
  seat,
  shown,
  startsInSeconds,
}: LobbyPartProps) => {
  const [showRules, setShowRules] = useState(false);
  const ready =
    lobby.members.find((member) => member.id === lobby.you)?.ready === true;
  const gathering = lobby.phase === "gathering";
  const hosting = lobby.hostId === lobby.you && gathering;
  const toggleReady = useEffectEvent(() => {
    if (shown && gathering && !seat.race()) {
      seat.setReady(!ready);
    }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.code === READY_KEY &&
        !event.repeat &&
        !keptByControl(event.target, event.code)
      ) {
        toggleReady();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <>
      <PanelTitle face="stencil">
        {lobby.roomKind === "public" ? "Public lobby" : roomId}
      </PanelTitle>
      <PanelRule />
      <MemberRows lobby={lobby} />
      <PanelLine aria-live="polite">
        {startLine(lobby, startsInSeconds)}
      </PanelLine>
      {gathering && (
        <SkewButton
          aria-pressed={ready}
          detail="Enter"
          onClick={toggleReady}
          title={ready ? "Not ready" : "Ready"}
          tone={ready ? "plain" : "primary"}
        />
      )}
      {copied && <PanelLine tone="quiet">Link copied. Send it.</PanelLine>}
      <TextLinks>
        {lobby.roomKind === "custom" && (
          <TextButton onClick={onCopyLink}>Copy the link</TextButton>
        )}
        <TextButton
          aria-expanded={showRules}
          onClick={() => {
            setShowRules(!showRules);
          }}
        >
          The rules
        </TextButton>
        <TextButton onClick={onLeave}>Leave</TextButton>
      </TextLinks>
      {showRules &&
        (hosting ? (
          <RuleChoices onChoose={seat.choose} rule={lobby.rule} />
        ) : (
          <RuleLines rule={lobby.rule} />
        ))}
    </>
  );
};
