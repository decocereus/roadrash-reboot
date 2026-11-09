import { useEffect, useState, useSyncExternalStore } from "react";

import { ordinal } from "../../career/format.ts";
import { idleHud } from "../../hud-feed.ts";
import type { HudFeed } from "../../hud-feed.ts";
import { moveToRoom } from "../room-url.ts";

const TICK_MS = 250;
const BIKE_UP_MS = 3000;
const SECONDS_PER_MINUTE = 60;

const clockOf = (leftMs: number): string => {
  const seconds = Math.ceil(Math.max(0, leftMs) / 1000);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
};

const useNow = (): number => {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const ticking = setInterval(() => {
      setNow(performance.now());
    }, TICK_MS);
    return () => {
      clearInterval(ticking);
    };
  }, []);
  return now;
};

const HoldTimer = ({
  holdMs,
  leftMs,
}: {
  readonly holdMs: number;
  readonly leftMs: number;
}) => (
  <div className="flex flex-col gap-2">
    <div className="font-display tracking-display flex justify-between text-xl font-bold uppercase">
      <span>Get back in</span>
      <span className="text-neon-yellow numeric">{clockOf(leftMs)}</span>
    </div>
    <div className="bg-paper/20 h-1.5">
      <div
        className="bg-neon-yellow h-full"
        style={{ width: `${Math.max(0, leftMs / holdMs) * 100}%` }}
      />
    </div>
  </div>
);

const Card = ({
  children,
  label,
  late = false,
  title,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly late?: boolean;
  readonly title: string;
}) => (
  <div
    className={`bg-ink/95 text-paper flex w-[min(90vw,30rem)] flex-col gap-4 border-t-4 p-7 shadow-2xl ${late ? "border-neon-red" : "border-neon-yellow"}`}
    role="alert"
  >
    <p
      className={`font-display tracking-display text-sm font-bold uppercase ${late ? "text-neon-red" : "text-neon-yellow"}`}
    >
      {label}
    </p>
    <h2 className="font-display tracking-display text-5xl leading-none font-extrabold uppercase">
      {title}
    </h2>
    {children}
  </div>
);

const BarButton = ({
  onClick,
  strong = false,
}: {
  readonly onClick: () => void;
  readonly strong?: boolean;
}) => (
  <button
    className={`font-display tracking-display self-start border px-4 py-1.5 text-lg font-extrabold uppercase focus-visible:outline-2 ${strong ? "bg-neon-yellow text-ink border-neon-yellow" : "border-paper/40 text-paper"}`}
    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the only control on a screen that just took over
    autoFocus
    onClick={onClick}
    type="button"
  >
    Back to the bar
  </button>
);

const Backdrop = ({ children }: { readonly children: React.ReactNode }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-grayscale">
    {children}
  </div>
);

const LateCard = ({
  holdSeconds,
  onBack,
}: {
  readonly holdSeconds: number;
  readonly onBack: () => void;
}) => (
  <Backdrop>
    <Card label="Too late" late title="We kept your bike">
      <p className="text-paper/70">
        You were gone more than{" "}
        <span className="text-paper">{holdSeconds} seconds</span>. We&apos;ll
        ride it home. Catch the next one at the bar.
      </p>
      <BarButton onClick={onBack} strong />
    </Card>
  </Backdrop>
);

const LostCard = ({ onBack }: { readonly onBack: () => void }) => (
  <Backdrop>
    <Card label="Room restarted" late title="That race is gone">
      <p className="text-paper/70">
        The room restarted and lost the race. No result counts. Ready up and the
        next one starts from the line.
      </p>
      <BarButton onClick={onBack} strong />
    </Card>
  </Backdrop>
);

export const TooLate = ({
  holdSeconds,
  lostRace,
}: {
  readonly holdSeconds: number;
  readonly lostRace: string | null;
}) => {
  const [shown, setShown] = useState(true);
  const hide = () => {
    setShown(false);
  };
  if (!shown) {
    return null;
  }
  return lostRace === null ? (
    <LateCard holdSeconds={holdSeconds} onBack={hide} />
  ) : (
    <LostCard onBack={hide} />
  );
};

export const SignalLost = ({
  holdSeconds,
  lostAt,
  roomId,
}: {
  readonly holdSeconds: number;
  readonly lostAt: number;
  readonly roomId: string;
}) => {
  const now = useNow();
  const holdMs = holdSeconds * 1000;
  const leftMs = holdMs - (now - lostAt);
  const backToBar = () => {
    moveToRoom(roomId, "moved", "no");
  };
  if (leftMs <= 0) {
    return <LateCard holdSeconds={holdSeconds} onBack={backToBar} />;
  }
  return (
    <Backdrop>
      <Card label="Signal lost" title="Your bike is still rolling">
        <HoldTimer holdMs={holdMs} leftMs={leftMs} />
        <p className="text-paper/70">
          We&apos;re riding it for you. Getting you back on.
        </p>
        <BarButton onClick={backToBar} />
      </Card>
    </Backdrop>
  );
};

export const GettingBackOn = ({
  awayMs,
  holdSeconds,
}: {
  readonly awayMs: number;
  readonly holdSeconds: number;
}) => {
  const [heardAt] = useState(() => performance.now());
  const now = useNow();
  const holdMs = holdSeconds * 1000;
  return (
    <Backdrop>
      <Card label="Your race is still on" title="Getting you back on">
        <HoldTimer holdMs={holdMs} leftMs={holdMs - awayMs - (now - heardAt)} />
        <p className="text-paper/70">
          Loading the road. Then the bike is yours.
        </p>
      </Card>
    </Backdrop>
  );
};

export const BikeUp = ({ feed }: { readonly feed: HudFeed }) => {
  const { position } = useSyncExternalStore(
    feed.subscribe,
    feed.read,
    () => idleHud
  );
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const hiding = setTimeout(() => {
      setShown(false);
    }, BIKE_UP_MS);
    return () => {
      clearTimeout(hiding);
    };
  }, []);
  return shown ? (
    <div
      className="bg-ink/95 text-paper notice-in border-green absolute top-[6%] left-1/2 flex -translate-x-1/2 flex-col border-l-4 px-6 py-2 whitespace-nowrap shadow-xl"
      role="status"
    >
      <span className="font-display tracking-display text-3xl font-extrabold uppercase">
        Your bike is up
      </span>
      <span className="text-paper/70">
        You&apos;re running {ordinal(position).toLowerCase()}. Go.
      </span>
    </div>
  ) : null;
};
