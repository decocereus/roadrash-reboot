import { Button } from "@racer/ui/components/button";
import { useEffect, useRef, useState } from "react";

import { idleHud } from "../game/hud.ts";
import type { GameHandle, HudState } from "../game/hud.ts";

const notices = {
  "": "",
  air: "Air",
  armed: "Got the",
  broken: "Broke the",
  busted: "Busted",
  close: "Close call",
  disarmed: "Disarmed by",
  hit: "Hit by",
  knockdown: "Knocked down",
  police: "Police on you",
  wipeout: "Wipeout",
} as const;

const bareNotices = new Set(["wipeout", "close", "police", "busted"]);

function money(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function raceClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${rest}`;
}

function placeSuffix(place: number): string {
  if (place === 1) {
    return "st";
  }
  if (place === 2) {
    return "nd";
  }
  if (place === 3) {
    return "rd";
  }
  return "th";
}

function Stamina({
  label,
  value,
  align,
}: {
  readonly label: string;
  readonly value: number;
  readonly align: "left" | "right";
}) {
  return (
    <div className={`w-44 ${align === "right" ? "text-right" : ""}`}>
      <p className="text-foreground/80 font-mono text-[11px] tracking-[0.25em] uppercase drop-shadow">
        {label}
      </p>
      <div className="bg-background/50 mt-1 h-2 overflow-hidden rounded-full">
        <div
          className={`h-full ${value > 0.35 ? "bg-success" : "bg-destructive"} ${align === "right" ? "origin-right" : "origin-left"}`}
          style={{ transform: `scaleX(${Math.max(0, value)})` }}
        />
      </div>
    </div>
  );
}

function Key({ children }: { readonly children: string }) {
  return (
    <kbd className="border-border bg-background/60 rounded border px-1.5 py-0.5 font-mono text-[11px]">
      {children}
    </kbd>
  );
}

function TitleCard({
  ready,
  failure,
  onRide,
}: {
  readonly ready: boolean;
  readonly failure: string;
  readonly onRide: () => void;
}) {
  return (
    <section className="absolute bottom-10 left-6 max-w-sm sm:left-10">
      <p className="text-primary font-mono text-xs tracking-[0.3em] uppercase">
        Ridge Road · 4.2 km
      </p>
      <h1 className="mt-2 text-6xl leading-none font-black tracking-tight italic sm:text-7xl">
        RUSHLINE
      </h1>
      <p className="text-foreground/85 mt-3 text-base">
        Hold it open, lean through the bends, and stay out of the oncoming lane.
      </p>
      {failure === "" ? (
        <div className="mt-6 flex items-center gap-4">
          <Button disabled={!ready} onClick={onRide} size="lg">
            {ready ? "Ride" : "Loading"}
          </Button>
          <span className="text-muted-foreground text-xs">
            or press <Key>Enter</Key>
          </span>
        </div>
      ) : (
        <p className="text-destructive mt-6 text-sm font-medium" role="alert">
          Could not start the game: {failure}
        </p>
      )}
      <dl className="text-muted-foreground mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt>
          <Key>W</Key> <Key>↑</Key>
        </dt>
        <dd>Throttle</dd>
        <dt>
          <Key>S</Key> <Key>↓</Key>
        </dt>
        <dd>Brake</dd>
        <dt>
          <Key>A</Key> <Key>D</Key> <Key>←</Key> <Key>→</Key>
        </dt>
        <dd>Lean</dd>
        <dt>
          <Key>Space</Key> <Key>K</Key>
        </dt>
        <dd>Punch or swing a weapon, kick to steal one</dd>
        <dt>
          <Key>R</Key> <Key>M</Key>
        </dt>
        <dd>Restart, mute</dd>
      </dl>
    </section>
  );
}

function Results({
  hud,
  onRide,
}: {
  readonly hud: HudState;
  readonly onRide: () => void;
}) {
  return (
    <section className="bg-card/85 notice-in absolute top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 backdrop-blur">
      <p className="text-primary font-mono text-xs tracking-[0.3em] uppercase">
        Ridge Road
      </p>
      {hud.busted ? (
        <p className="text-destructive mt-2 text-5xl font-black uppercase italic">
          Busted
          <span className="text-muted-foreground numeric block text-lg normal-case not-italic">
            Fined {money(hud.fine)}
          </span>
        </p>
      ) : (
        <p className="numeric mt-2 text-5xl font-black italic">
          {hud.position}
          <span className="text-muted-foreground text-2xl">
            {placeSuffix(hud.position)} · {raceClock(hud.seconds)}
          </span>
        </p>
      )}
      <ol className="mt-4 space-y-1 text-sm">
        {hud.placings.map((placing, index) => (
          <li
            className={`flex justify-between ${placing.you ? "text-primary" : "text-muted-foreground"}`}
            key={placing.name}
          >
            <span>
              {index + 1}. {placing.name}
            </span>
            <span className="numeric">
              {placing.busted && "busted"}
              {!placing.busted &&
                (placing.seconds >= 0 ? raceClock(placing.seconds) : "racing")}
            </span>
          </li>
        ))}
      </ol>
      <dl className="text-muted-foreground mt-4 grid grid-cols-2 gap-y-1 text-sm">
        <dt>Top speed</dt>
        <dd className="text-foreground numeric text-right">
          {Math.round(hud.topSpeedKmh)} km/h
        </dd>
        <dt>Crashes</dt>
        <dd className="text-foreground numeric text-right">{hud.crashes}</dd>
      </dl>
      <Button className="mt-6 w-full" onClick={onRide} size="lg">
        Ride again
      </Button>
    </section>
  );
}

function Dash({ hud }: { readonly hud: HudState }) {
  return (
    <>
      <div className="absolute top-5 left-1/2 w-[min(28rem,60vw)] -translate-x-1/2">
        <div className="bg-background/50 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full origin-left"
            style={{ transform: `scaleX(${hud.progress})` }}
          />
        </div>
      </div>
      <p className="numeric absolute top-4 right-6 font-mono text-xl font-semibold drop-shadow">
        {raceClock(hud.seconds)}
      </p>
      <p className="numeric absolute top-12 right-6 text-4xl font-black italic drop-shadow-lg">
        {hud.position}
        <span className="text-foreground/70 text-lg">/{hud.riderCount}</span>
      </p>
      <div className="absolute bottom-8 left-6">
        {hud.weaponName !== "" && (
          <p className="text-primary mb-2 font-mono text-xs tracking-[0.25em] uppercase drop-shadow">
            {hud.weaponName}
            <span className="text-foreground/70 numeric">
              {" "}
              · {hud.weaponHits} {hud.weaponHits === 1 ? "hit" : "hits"}
            </span>
          </p>
        )}
        <Stamina align="left" label="You" value={hud.stamina} />
      </div>
      {hud.copChasing && hud.phase === "racing" && (
        <p className="bg-destructive/85 absolute top-24 right-6 animate-pulse rounded px-2 py-1 font-mono text-xs font-semibold tracking-[0.25em] text-white uppercase">
          Police
        </p>
      )}
      {hud.rivalName !== "" && (
        <div className="absolute right-6 bottom-8">
          <Stamina
            align="right"
            label={hud.rivalName}
            value={hud.rivalStamina}
          />
        </div>
      )}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center drop-shadow-lg">
        <p className="numeric text-7xl leading-none font-black italic">
          {Math.round(hud.speedKmh)}
        </p>
        <p className="text-foreground/80 font-mono text-xs tracking-[0.3em]">
          KM/H
        </p>
      </div>
    </>
  );
}

export function RaceScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const [hud, setHud] = useState<HudState>(idleHud);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let disposed = false;
    import("../game/game.ts")
      .then(({ createGame }) => {
        if (disposed) {
          return;
        }
        gameRef.current = createGame(canvas, setHud);
        setReady(true);
      })
      .catch((error) => {
        if (!disposed) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      disposed = true;
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  const ride = () => gameRef.current?.startRace();
  const live = hud.phase === "racing" || hud.phase === "countdown";

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#c9dbe8] select-none">
      <canvas
        aria-label="Motorcycle race on Ridge Road"
        className="block size-full"
        ref={canvasRef}
      />
      {hud.phase === "attract" && (
        <>
          <div className="from-background/80 via-background/30 pointer-events-none absolute inset-0 bg-gradient-to-tr to-transparent" />
          <TitleCard failure={failure} onRide={ride} ready={ready} />
        </>
      )}
      {(live || hud.phase === "finished") && <Dash hud={hud} />}
      {hud.phase === "countdown" && (
        <p
          className="numeric notice-in absolute top-1/3 left-1/2 -translate-x-1/2 text-9xl font-black italic drop-shadow-lg"
          key={hud.countdown}
        >
          {hud.countdown}
        </p>
      )}
      {hud.phase === "racing" && hud.notice !== "" && (
        <p
          className="text-primary notice-in absolute top-1/4 left-1/2 -translate-x-1/2 text-4xl font-black tracking-tight uppercase italic drop-shadow-lg"
          key={hud.notice}
        >
          {notices[hud.notice]}
          {!bareNotices.has(hud.notice) && ` ${hud.noticeDetail}`}
        </p>
      )}
      {hud.phase === "finished" && <Results hud={hud} onRide={ride} />}
      {hud.phase !== "attract" && (
        <button
          className="text-foreground/80 hover:text-foreground absolute top-4 left-6 font-mono text-xs tracking-[0.2em] uppercase"
          onClick={(event) => {
            gameRef.current?.toggleMute();
            event.currentTarget.blur();
          }}
          type="button"
        >
          Sound {hud.muted ? "off" : "on"}
        </button>
      )}
    </main>
  );
}
