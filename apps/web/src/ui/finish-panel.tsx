import type { RaceSnapshot } from "../game/types";

interface FinishPanelProps {
  snapshot: RaceSnapshot;
  roomCode: string;
  finishLabel: string;
  onRestart: () => void;
  onReturnToGarage: () => void;
}

export function FinishPanel({
  snapshot,
  roomCode,
  finishLabel,
  onRestart,
  onReturnToGarage,
}: FinishPanelProps) {
  const rankedRiders = [...snapshot.riders].sort(
    (left, right) =>
      (left.place ?? Number.POSITIVE_INFINITY) - (right.place ?? Number.POSITIVE_INFINITY) ||
      right.progress - left.progress,
  );

  return (
    <section className="finish-screen">
      <div className="finish-card">
        <span className="eyebrow">R-01 / FINISH LINE</span>
        <h2>{finishLabel}</h2>
        <p>
          {snapshot.phase === "aborted"
            ? "The room closed before the finish was recorded."
            : snapshot.player.crashed
              ? "The road won this round. Get back on it."
              : `You crossed the line in position ${snapshot.position}.`}
        </p>
        <div className="finish-stats">
          <span>
            TIME <strong>{snapshot.elapsed.toFixed(2)}s</strong>
          </span>
          <span>
            DAMAGE <strong>{Math.max(0, 100 - snapshot.player.health)}%</strong>
          </span>
          <span>
            ROOM <strong>{roomCode}</strong>
          </span>
        </div>
        <div className="finish-standings" aria-label="Final standings">
          <span className="finish-standings-heading">FINAL ORDER</span>
          {rankedRiders.map((rider, index) => (
            <div className="finish-standing" key={rider.id}>
              <strong>{String(rider.place ?? index + 1).padStart(2, "0")}</strong>
              <span>{rider.name}</span>
              {rider.id === "player" && <em>YOU</em>}
            </div>
          ))}
        </div>
        <div className="finish-actions">
          <button className="primary-action" onClick={onRestart}>
            ↻ ride again
          </button>
          <button className="secondary-action" onClick={onReturnToGarage}>
            back to garage
          </button>
        </div>
      </div>
    </section>
  );
}
