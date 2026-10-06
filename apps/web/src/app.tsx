import { useCallback, useEffect, useMemo, useState } from "react";
import { RaceScene } from "./game/race-scene";
import { createRoom, joinRoom, type RoomSession } from "./game/transport";
import { createRaceSnapshot, type RaceSnapshot } from "./game/types";
import { RaceOverlays } from "./ui/race-overlays";

const formatRoomCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

export function App() {
  const [snapshot, setSnapshot] = useState<RaceSnapshot>(() => createRaceSnapshot());
  const [raceStarted, setRaceStarted] = useState(false);
  const [raceKey, setRaceKey] = useState(0);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [nickname, setNickname] = useState("Rider");
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [roomError, setRoomError] = useState("");

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get("room");
    if (inviteCode) setJoinCode(formatRoomCode(inviteCode));
  }, []);

  const handleSnapshot = useCallback((next: RaceSnapshot) => setSnapshot(next), []);
  const handleRoomState = useCallback((phase: string) => {
    if (phase === "countdown" || phase === "racing") setRaceStarted(true);
  }, []);
  const handleRoomError = useCallback((message: string) => setRoomError(message), []);
  const unlockAudio = useCallback(() => setSoundReady(true), []);
  const toggleMute = useCallback(() => setMuted((value) => !value), []);
  const startSolo = useCallback(async () => {
    setRoomError("");
    try {
      const nextSession = await createRoom(nickname.trim() || "Rider");
      setSession(nextSession);
      setRoomCode(nextSession.roomCode);
      setRaceStarted(true);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Unable to create a race room");
    }
  }, [nickname]);
  const createInviteRoom = useCallback(async () => {
    setRoomError("");
    try {
      const nextSession = await createRoom(nickname.trim() || "Host");
      setSession(nextSession);
      setRoomCode(nextSession.roomCode);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Unable to create an invite room");
    }
  }, [nickname]);
  const joinExistingRoom = useCallback(async () => {
    const code = formatRoomCode(joinCode);
    if (code.length !== 6) return;
    setRoomError("");
    try {
      const nextSession = await joinRoom(code, nickname.trim() || "Rider");
      setSession(nextSession);
      setRoomCode(nextSession.roomCode);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Unable to join room");
    }
  }, [joinCode, nickname]);
  const beginRace = useCallback(() => setRaceStarted(true), []);
  const restart = useCallback(() => {
    setSession(null);
    setRoomCode("");
    setRaceKey((key) => key + 1);
    setRaceStarted(false);
    void startSolo();
  }, [startSolo]);
  const handleFinish = useCallback(() => undefined, []);
  const returnToGarage = useCallback(() => {
    setSession(null);
    setRoomCode("");
    setRaceStarted(false);
  }, []);
  const copyInvite = useCallback(() => {
    if (!roomCode) return;
    const invite = `${window.location.origin}/?room=${roomCode}`;
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(invite).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [roomCode]);

  const finishLabel = useMemo(() => {
    if (snapshot.phase === "aborted") return "RACE STOPPED";
    if (snapshot.player.crashed) return "BIKE DOWN";
    if (snapshot.finishOrder[0] === "player") return "YOU TAKE IT";
    if (snapshot.finishOrder.length > 0) return "PHOTO FINISH";
    return "RACE COMPLETE";
  }, [snapshot.finishOrder, snapshot.phase, snapshot.player.crashed]);

  return (
    <main className="app-shell">
      <RaceScene
        key={raceKey}
        running={raceStarted}
        roomSession={session}
        muted={muted}
        onSnapshot={handleSnapshot}
        onRoomState={handleRoomState}
        onRoomError={handleRoomError}
        onUnlockAudio={unlockAudio}
        onToggleMute={toggleMute}
        onFinish={handleFinish}
      />
      <div className="vignette" />
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">R</span>
          <div>
            <strong>RUSHLINE</strong>
            <span>river city / 01</span>
          </div>
        </div>
        <div className="network-state">
          <span className="state-dot" /> {session ? "server room" : "awaiting room"}{" "}
          <span className="divider">/</span> 30 hz
        </div>
        <button className="sound-toggle" onClick={toggleMute} aria-pressed={muted}>
          <span className="sound-icon">{muted ? "×" : "))"}</span>{" "}
          {muted ? "sound off" : "sound on"}
        </button>
      </header>

      <section className={`race-hud ${raceStarted ? "is-live" : ""}`} aria-label="Race telemetry">
        <div className="dash-shell">
          <div className="dash-position">
            <strong>
              {snapshot.position}
              <small>/4</small>
            </strong>
            <span>POSITION</span>
          </div>
          <div className="dash-speed">
            <strong>{Math.round(snapshot.player.speed)}</strong>
            <span>KM/H</span>
          </div>
          <div className="dash-condition">
            <span>RIDER / BIKE</span>
            <div className="condition-track">
              <i style={{ width: `${Math.max(0, snapshot.player.health)}%` }} />
            </div>
            <strong>{Math.max(0, Math.round(snapshot.player.health))}%</strong>
            <span className="route-mileage">
              RIVER CITY · {Math.max(0, Math.round(snapshot.player.progress))} M
            </span>
          </div>
          <div className="dash-distance">
            <strong>
              {Math.min(
                100,
                Math.max(0, Math.round((snapshot.player.progress / snapshot.distance) * 100)),
              )}
              %
            </strong>
            <span>COURSE</span>
          </div>
        </div>
      </section>

      <RaceOverlays
        raceStarted={raceStarted}
        session={session}
        snapshot={snapshot}
        roomCode={roomCode}
        roomError={roomError}
        soundReady={soundReady}
        copied={copied}
        nickname={nickname}
        joinCode={joinCode}
        finishLabel={finishLabel}
        onNicknameChange={setNickname}
        onJoinCodeChange={(value) => setJoinCode(formatRoomCode(value))}
        onSolo={() => void startSolo()}
        onCreateInvite={() => void createInviteRoom()}
        onJoin={() => void joinExistingRoom()}
        onCopyInvite={copyInvite}
        onStart={beginRace}
        onRestart={restart}
        onReturnToGarage={returnToGarage}
      />

      {!raceStarted && (
        <footer className="footer-bar">
          <span>RUSHLINE · ORIGINAL ARCADE RACER</span>
          <span>RIVER CITY CIRCUIT / 01</span>
        </footer>
      )}
    </main>
  );
}
