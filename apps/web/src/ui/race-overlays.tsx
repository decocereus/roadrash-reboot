import type { RaceSnapshot } from "../game/types";
import type { RoomSession } from "../game/transport";
import { FinishPanel } from "./finish-panel";
import { LobbyPanel } from "./lobby-panel";
import { StartPanel } from "./start-panel";

interface RaceOverlaysProps {
  raceStarted: boolean;
  session: RoomSession | null;
  snapshot: RaceSnapshot;
  roomCode: string;
  roomError: string;
  soundReady: boolean;
  copied: boolean;
  nickname: string;
  joinCode: string;
  finishLabel: string;
  onNicknameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onSolo: () => void;
  onCreateInvite: () => void;
  onJoin: () => void;
  onCopyInvite: () => void;
  onStart: () => void;
  onRestart: () => void;
  onReturnToGarage: () => void;
}

export function RaceOverlays({
  raceStarted,
  session,
  snapshot,
  roomCode,
  roomError,
  soundReady,
  copied,
  nickname,
  joinCode,
  finishLabel,
  onNicknameChange,
  onJoinCodeChange,
  onSolo,
  onCreateInvite,
  onJoin,
  onCopyInvite,
  onStart,
  onRestart,
  onReturnToGarage,
}: RaceOverlaysProps) {
  return (
    <>
      {!raceStarted && !session && (
        <StartPanel
          nickname={nickname}
          joinCode={joinCode}
          onNicknameChange={onNicknameChange}
          onJoinCodeChange={onJoinCodeChange}
          onSolo={onSolo}
          onCreateInvite={onCreateInvite}
          onJoin={onJoin}
        />
      )}
      {!raceStarted && session && (
        <LobbyPanel
          host={session.host}
          roomCode={session.roomCode}
          copied={copied}
          onCopyInvite={onCopyInvite}
          onStart={onStart}
        />
      )}
      {roomError && <div className="room-error">{roomError}</div>}
      {raceStarted && snapshot.phase === "racing" && (
        <>
          <div className="live-chip">
            <span className="state-dot" /> LIVE RACE <span>room {roomCode}</span>
          </div>
          <div className="event-feed">
            <div>
              <i className="feed-line" /> traffic ahead / hold your line
            </div>
            <div>
              <i className="feed-line accent" />{" "}
              {soundReady ? "audio unlocked" : "press a key to unlock sound"}
            </div>
          </div>
          <div className="control-hint">
            <strong>SPACE</strong> strike <span>·</span> <strong>SHIFT / ↓</strong> brake
          </div>
        </>
      )}
      {roomCode && !raceStarted && !session && (
        <div className="room-dock">
          <span>INVITE ROOM</span>
          <strong>{roomCode}</strong>
          <button onClick={onCopyInvite}>{copied ? "copied" : "copy invite"}</button>
        </div>
      )}
      {raceStarted && snapshot.phase !== "racing" && (
        <FinishPanel
          snapshot={snapshot}
          roomCode={roomCode}
          finishLabel={finishLabel}
          onRestart={onRestart}
          onReturnToGarage={onReturnToGarage}
        />
      )}
    </>
  );
}
