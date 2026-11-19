import { chaserGap } from "@racer/sim/police";
import { distanceLeft, standings } from "@racer/sim/race";
import type { RiderView } from "@racer/sim/race-view";
import { clamp, FULL_CONDITION, MAX_STAMINA, riderOf } from "@racer/sim/state";
import type {
  HazardEffect,
  RaceEvent,
  RiderId,
  WeaponKind,
} from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";

import type { Recorder } from "../diagnostics/recorder.ts";
import type { Cue } from "../sound/cues.ts";
import type { Sound } from "../sound/sound.ts";
import type { ChaseCamera } from "./chase-camera.ts";
import { hudCountdown, roomOf } from "./game-session.ts";
import type { Session } from "./game-session.ts";
import type { GameEvents, Notice } from "./hud.ts";
import type { Stage } from "./scene-lifecycle.ts";

const NOTICE_SECONDS = 0.8;
const HAZARD_JOLT = {
  bump: 0.55,
  jolt: 0.35,
  slip: 0.15,
  stagger: 0.6,
} as const satisfies Record<HazardEffect, number>;
const BUMP_PER_IMPACT = 1 / 9;
const HEARD_FROM = 60;
const OTHERS_GAIN = 0.7;
const NEAR_SIDE = 6;
const WIDEST_PAN = 0.85;
const PLACE_HOLD_MS = 500;

const strikeCues = {
  baton: "batonHit",
  chain: "chainHit",
  club: "clubHit",
  crowbar: "crowbarHit",
  cue: "cueHit",
  none: "hit",
  sign: "signHit",
} as const satisfies Record<WeaponKind, Cue>;

const thumpGain = (strength: number): number =>
  Math.min(1, 0.3 + strength * 0.6);

const weaponName = (rider: RiderView): string =>
  rider.weapon === "none" ? "" : weapons[rider.weapon].name;

const weaponCapacity = (rider: RiderView): number =>
  rider.weapon === "none" ? 0 : weapons[rider.weapon].hits;

export const out = (rider: RiderView): boolean =>
  rider.mode === "busted" || rider.mode === "wrecked";

const needsRemountPrompt = (rider: RiderView): boolean =>
  !rider.runningToBike &&
  (rider.mode === "thrown" ||
    rider.mode === "lying" ||
    rider.mode === "running");

export interface Feedback {
  notice: Notice;
  noticeDetail: string;
  noticeLeft: number;
}

export const createFeedback = (): Feedback => ({
  notice: "",
  noticeDetail: "",
  noticeLeft: 0,
});

interface FeedbackParts {
  readonly chase: Pick<ChaseCamera, "bump" | "jolt">;
  readonly drawnSpeed: () => number;
  readonly events: Pick<GameEvents, "onHud">;
  readonly feedback: Feedback;
  readonly owners: (() => void)[];
  readonly player: () => RiderView;
  readonly recorder: Pick<Recorder, "race">;
  readonly session: () => Session;
  readonly sound: Pick<Sound, "hush" | "muted" | "play" | "toggleMute">;
  readonly stage: Pick<Stage, "me" | "race" | "track">;
}

export const bindFeedback = ({
  chase,
  drawnSpeed,
  events,
  feedback,
  owners,
  player,
  recorder,
  session,
  sound,
  stage,
}: FeedbackParts) => {
  const say = (next: Notice, detail = "") => {
    feedback.notice = next;
    feedback.noticeDetail = detail;
    feedback.noticeLeft = NOTICE_SECONDS;
  };

  const quiet = () => {
    sound.hush();
  };

  let countHeard = 0;
  let placeHeard = 0;
  let placeSeen = 0;
  let placeSince = 0;

  const cueCountdown = (count: number, racing: boolean) => {
    if (count > 0 && count !== countHeard) {
      sound.play("count");
    } else if (count === 0 && countHeard > 0 && racing) {
      sound.play("go");
    }
    countHeard = count;
  };

  const cuePlace = (place: number, racing: boolean) => {
    const now = performance.now();
    if (!racing) {
      placeHeard = place;
      placeSeen = place;
      return;
    }
    if (place !== placeSeen) {
      placeSeen = place;
      placeSince = now;
      return;
    }
    if (place !== placeHeard && now - placeSince >= PLACE_HOLD_MS) {
      sound.play(place < placeHeard ? "gained" : "lost");
      placeHeard = place;
    }
  };
  owners.push(quiet);

  const toggleMute = () => {
    sound.toggleMute();
  };

  const playFrom = (cue: Cue, from: RiderId, gain: number) => {
    const source = riderOf(stage.race.view.riders, from);
    if (!source) {
      return;
    }
    const me = player();
    const ds = source.s - me.s;
    const dx = source.x - me.x;
    const fade = Math.max(0, 1 - Math.hypot(ds, dx) / HEARD_FROM);
    if (fade > 0) {
      const side = clamp(dx / (Math.abs(ds) + NEAR_SIDE), -1, 1);
      sound.play(cue, side * WIDEST_PAN, gain * fade * fade);
    }
  };

  const reactToHit = (
    attacker: RiderId,
    target: RiderId,
    weapon: WeaponKind
  ) => {
    const cue = strikeCues[weapon];
    if (attacker === stage.me) {
      sound.play(cue);
      const victim = riderOf(stage.race.view.riders, target);
      if (victim && victim.stamina <= 0) {
        say("knockdown");
      }
    } else if (target === stage.me) {
      sound.play(cue);
      chase.jolt(weapon === "none" ? 0.5 : 0.8);
    } else {
      playFrom(cue, target, OTHERS_GAIN);
    }
  };

  const reactToOwn = (event: RaceEvent) => {
    if (event.kind === "crash") {
      recorder.race("crash", stage.race.view.tick);
      chase.jolt(1);
      sound.play("crash");
      say("wipeout");
    } else if (event.kind === "knockedDown") {
      chase.jolt(0.7);
      sound.play("thump", 0, thumpGain(0.8));
    } else if (event.kind === "nearMiss") {
      sound.play("whoosh");
    } else if (event.kind === "land") {
      chase.bump(-event.impact * BUMP_PER_IMPACT);
      if (event.airSeconds > 0.35) {
        chase.jolt(Math.min(0.8, Math.abs(event.impact) * 0.07));
        sound.play("land", 0, thumpGain(Math.abs(event.impact) / 10));
      }
    } else if (event.kind === "glance" || event.kind === "bump") {
      chase.jolt(0.45);
      sound.play("thump", 0, thumpGain(0.5));
    } else if (event.kind === "hazard") {
      chase.jolt(HAZARD_JOLT[event.effect]);
      sound.play("thump", 0, thumpGain(HAZARD_JOLT[event.effect]));
    } else if (event.kind === "attack") {
      sound.play("swing");
    } else if (event.kind === "riderContact") {
      chase.jolt(0.3);
      sound.play("thump", 0, thumpGain(0.35));
    } else if (event.kind === "weaponTaken") {
      say("armed", weapons[event.weapon].name);
    } else if (event.kind === "weaponBroken") {
      say("broken", weapons[event.weapon].name);
    } else if (event.kind === "busted") {
      chase.jolt(0.4);
    } else if (event.kind === "finish") {
      sound.play("finish");
    }
  };

  const reactToOthers = (event: RaceEvent) => {
    if (event.kind === "riderContact" && event.other === stage.me) {
      chase.jolt(0.3);
      sound.play("thump", 0, thumpGain(0.35));
    } else if (event.kind === "weaponTaken" && event.target === stage.me) {
      say("disarmed");
    } else if (event.kind === "pursuit" && event.target === stage.me) {
      sound.play("siren");
      say("police");
    } else if (event.kind === "crash") {
      playFrom("crash", event.rider, OTHERS_GAIN);
    }
  };

  const react = (heard: readonly RaceEvent[]) => {
    for (const event of heard) {
      if (event.kind === "hit") {
        reactToHit(event.rider, event.target, event.weapon);
      } else if (event.rider === stage.me) {
        reactToOwn(event);
      } else {
        reactToOthers(event);
      }
    }
  };

  const report = () => {
    const me = player();
    const order = standings(stage.race.view);
    const state = session();
    const room = roomOf(state);
    const countdown = hudCountdown(state);
    const place = order.indexOf(stage.me) + 1;
    const racing = state.phase === "racing";
    cueCountdown(countdown, racing);
    cuePlace(place, racing && countdown === 0);
    events.onHud({
      bikeName: me.bike.name,
      condition: me.condition / FULL_CONDITION,
      copGap: chaserGap(stage.race.view, stage.me),
      countdown,
      distanceLeft: distanceLeft(stage.track, me),
      gear: me.gear,
      lagging: room?.lagging() ?? false,
      muted: sound.muted(),
      notice: feedback.noticeLeft > 0 ? feedback.notice : "",
      noticeDetail: feedback.noticeDetail,
      offBike: me.mode !== "riding",
      phase: state.phase,
      position:
        state.phase === "settled"
          ? state.outcome.place
          : place,
      progress: clamp(me.bodyS / stage.track.length, 0, 1),
      remountPrompt: needsRemountPrompt(me),
      riderCount: order.length,
      roadLength: stage.track.length,
      roadName: stage.track.plan.name,
      speedKmh: Math.abs(drawnSpeed()) * 3.6,
      stallLeftMs: room?.stallLeftMs() ?? null,
      stamina: me.stamina / MAX_STAMINA,
      weaponCapacity: weaponCapacity(me),
      weaponHits: me.weaponHits,
      weaponName: weaponName(me),
    });
  };

  return { quiet, react, report, say, toggleMute };
};
