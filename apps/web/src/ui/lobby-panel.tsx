interface LobbyPanelProps {
  host: boolean;
  roomCode: string;
  copied: boolean;
  onCopyInvite: () => void;
  onStart: () => void;
}

export function LobbyPanel({ host, roomCode, copied, onCopyInvite, onStart }: LobbyPanelProps) {
  return (
    <section className="lobby-screen">
      <div className="lobby-card">
        <span className="eyebrow">PRIVATE ROOM / {host ? "HOST" : "RIDER"}</span>
        <h2>
          Ready when
          <br />
          <span>you are.</span>
        </h2>
        <p>
          Share this code with up to three riders. The room fills with rivals when the countdown
          begins.
        </p>
        <div className="room-code-large">
          <span>ROOM CODE</span>
          <strong>{roomCode}</strong>
          <button onClick={onCopyInvite}>{copied ? "copied" : "copy invite link"}</button>
        </div>
        {host ? (
          <button className="primary-action" onClick={onStart}>
            ▶ start the race
          </button>
        ) : (
          <div className="waiting-state">
            <span className="state-dot" /> waiting for host to start
          </div>
        )}
      </div>
    </section>
  );
}
