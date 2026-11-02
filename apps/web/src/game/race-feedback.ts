import type { RaceOutcome } from "@racer/career/outcome";
import { chaserDistance } from "@racer/sim/police";
import { distanceLeft, standings } from "@racer/sim/race";
import type { RiderView } from "@racer/sim/race-view";
import {
  clamp,
  FULL_CONDITION,
  MAX_STAMINA,
  PLAYER_RIDER,
  riderOf,
} from "@racer/sim/state";
import type { HazardEffect, RaceEvent, RiderId } from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";

import type { Recorder } from "../diagnostics/recorder.ts";
import type { Sound } from "./audio.ts";
import type { ChaseCamera } from "./chase-camera.ts";
import type { GameEvents, GamePhase, Notice } from "./hud.ts";
import type { Stage } from "./scene-lifecycle.ts";

const NOTICE_SECONDS = 0.8;
const HAZARD_JOLT = {
  bump: 0.55,
  jolt: 0.35,
  slip: 0.15,
  stagger: 0.6,
} as const satisfies Record<HazardEffect, number>;
const BUMP_PER_IMPACT = 1 / 9;

const weaponName = (rider: RiderView): string =>
  rider.weapon === "none" ? "" : weapons[rider.weapon].name;

const weaponCapacity = (rider: RiderView): number =>
  rider.weapon === "none" ? 0 : weapons[rider.weapon].hits;

export const out = (rider: RiderView): boolean =>
  rider.mode === "busted" || rider.mode === "wrecked";

export interface Feedback {
  notice: Notice;
  noticeDetail: string;
  noticeLeft: number;
  muted: boolean;
}

export const createFeedback = (): Feedback => ({
  muted: false,
  notice: "",
  noticeDetail: "",
  noticeLeft: 0,
});

interface FeedbackSession {
  readonly phase: GamePhase;
  readonly settled: RaceOutcome | null;
  readonly holdLeft: number;
  readonly countdown: number;
}

interface FeedbackParts {
  readonly chase: ChaseCamera;
  readonly events: GameEvents;
  readonly feedback: Feedback;
  readonly player: () => RiderView;
  readonly recorder: Recorder;
  readonly session: FeedbackSession;
  readonly sound: Sound;
  readonly stage: Pick<Stage, "race" | "track">;
}

export const bindFeedback = ({
  chase,
  events,
  feedback,
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
    sound.drive(0, 0, 0, false);
  };

  const toggleMute = () => {
    feedback.muted = !feedback.muted;
    sound.setMuted(feedback.muted);
  };

  const strikeSound = (armed: boolean) => {
    if (armed) {
      sound.weaponHit();
    } else {
      sound.hit();
    }
  };

  const reactToHit = (attacker: RiderId, target: RiderId, armed: boolean) => {
    if (attacker === PLAYER_RIDER) {
      strikeSound(armed);
      const victim = riderOf(stage.race.view.riders, target);
      if (victim && victim.stamina <= 0) {
        say("knockdown");
      }
    } else if (target === PLAYER_RIDER) {
      strikeSound(armed);
      chase.jolt(armed ? 0.8 : 0.5);
    }
  };

  const reactToOwn = (event: RaceEvent) => {
    if (event.kind === "crash") {
      recorder.race("crash", stage.race.view.tick);
      chase.jolt(1);
      sound.crash();
      say("wipeout");
    } else if (event.kind === "knockedDown") {
      chase.jolt(0.7);
      sound.thump(0.8);
    } else if (event.kind === "nearMiss") {
      sound.whoosh();
    } else if (event.kind === "land") {
      chase.bump(-event.impact * BUMP_PER_IMPACT);
      if (event.airSeconds > 0.35) {
        chase.jolt(Math.min(0.8, Math.abs(event.impact) * 0.07));
        sound.thump(Math.abs(event.impact) / 10);
      }
    } else if (event.kind === "glance" || event.kind === "bump") {
      chase.jolt(0.45);
      sound.thump(0.5);
    } else if (event.kind === "hazard") {
      chase.jolt(HAZARD_JOLT[event.effect]);
      sound.thump(HAZARD_JOLT[event.effect]);
    } else if (event.kind === "attack") {
      sound.swing();
    } else if (event.kind === "riderContact") {
      chase.jolt(0.3);
      sound.thump(0.35);
    } else if (event.kind === "weaponTaken") {
      say("armed", weapons[event.weapon].name);
    } else if (event.kind === "weaponBroken") {
      say("broken", weapons[event.weapon].name);
    } else if (event.kind === "busted") {
      chase.jolt(0.4);
    }
  };

  const reactToOthers = (event: RaceEvent) => {
    if (event.kind === "riderContact" && event.other === PLAYER_RIDER) {
      chase.jolt(0.3);
      sound.thump(0.35);
    } else if (event.kind === "weaponTaken" && event.target === PLAYER_RIDER) {
      say("disarmed");
    } else if (event.kind === "pursuit" && event.target === PLAYER_RIDER) {
      sound.siren();
      say("police");
    } else if (event.kind === "crash") {
      const fallen = riderOf(stage.race.view.riders, event.rider);
      if (
        event.cause === "combat" &&
        fallen &&
        Math.abs(fallen.s - player().s) < 30
      ) {
        sound.thump(0.6);
      }
    }
  };

  const react = () => {
    for (const event of stage.race.view.events) {
      if (event.kind === "hit") {
        reactToHit(event.rider, event.target, event.weapon !== "none");
      } else if (event.rider === PLAYER_RIDER) {
        reactToOwn(event);
      } else {
        reactToOthers(event);
      }
    }
  };

  const report = () => {
    const me = player();
    const order = standings(stage.race.view);
    events.onHud({
      bikeName: me.bike.name,
      condition: me.condition / FULL_CONDITION,
      copDistance: chaserDistance(stage.race.view, PLAYER_RIDER),
      countdown: Math.max(
        0,
        Math.ceil(session.holdLeft > 0 ? session.holdLeft : session.countdown)
      ),
      distanceLeft: distanceLeft(stage.track, me),
      gear: me.gear,
      muted: feedback.muted,
      notice: feedback.noticeLeft > 0 ? feedback.notice : "",
      noticeDetail: feedback.noticeDetail,
      offBike: me.mode !== "riding",
      phase: session.phase,
      position: session.settled?.place ?? order.indexOf(PLAYER_RIDER) + 1,
      progress: clamp(me.bodyS / stage.track.length, 0, 1),
      riderCount: order.length,
      roadLength: stage.track.length,
      roadName: stage.track.plan.name,
      speedKmh: me.speed * 3.6,
      stamina: me.stamina / MAX_STAMINA,
      weaponCapacity: weaponCapacity(me),
      weaponHits: me.weaponHits,
      weaponName: weaponName(me),
    });
  };

  return { quiet, react, report, say, toggleMute };
};
