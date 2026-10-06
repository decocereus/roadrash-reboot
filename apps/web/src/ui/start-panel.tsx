interface StartPanelProps {
  nickname: string;
  joinCode: string;
  onNicknameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onSolo: () => void;
  onCreateInvite: () => void;
  onJoin: () => void;
}

export function StartPanel({
  nickname,
  joinCode,
  onNicknameChange,
  onJoinCodeChange,
  onSolo,
  onCreateInvite,
  onJoin,
}: StartPanelProps) {
  return (
    <section className="start-screen">
      <div className="start-copy">
        <div className="eyebrow">RIVER CITY / THE FIRST RUN</div>
        <h1>
          Own the
          <br />
          <span>street.</span>
        </h1>
        <p>Thread the traffic. Catch the pack. Make room with your right hand.</p>
        <div className="start-actions">
          <button className="primary-action" onClick={onSolo}>
            <span>▶</span> ride solo
          </button>
          <button className="secondary-action" onClick={onCreateInvite}>
            <span>＋</span> create invite room
          </button>
        </div>
        <label className="nickname-row">
          <span>RIDER NAME</span>
          <input
            aria-label="Rider nickname"
            placeholder="YOUR NAME"
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value.slice(0, 20))}
            maxLength={20}
          />
        </label>
        <div className="join-row">
          <input
            aria-label="Room code"
            placeholder="ENTER ROOM CODE"
            value={joinCode}
            onChange={(event) => onJoinCodeChange(event.target.value)}
            maxLength={6}
          />
          <button onClick={onJoin} disabled={joinCode.length !== 6}>
            join room
          </button>
        </div>
      </div>
      <div className="start-meta">
        <div className="meta-block">
          <span>RIDER COUNT</span>
          <strong>04</strong>
          <small>up to four humans</small>
        </div>
        <div className="meta-block">
          <span>MODE</span>
          <strong>RACE</strong>
          <small>server finish order</small>
        </div>
        <div className="control-strip">
          <span>W / ↑</span> throttle <span>A D / ← →</span> steer <span>SPACE</span> strike{" "}
          <span>M</span> sound
        </div>
      </div>
    </section>
  );
}
