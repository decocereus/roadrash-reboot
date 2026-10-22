import { rivalLines } from "@racer/career/lines";
import type { RaceOutcome } from "@racer/career/outcome";
import { chaserDistance } from "@racer/sim/police";
import { distanceLeft, standings } from "@racer/sim/race";
import type { RiderView } from "@racer/sim/race-view";
import { clamp, FULL_CONDITION, MAX_STAMINA } from "@racer/sim/state";
import type { HazardEffect, RaceEvent } from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";
import * as THREE from "three";

import type { Recorder } from "../diagnostics/recorder.ts";
import type { Sound } from "./audio.ts";
import type { ChaseCamera } from "./chase-camera.ts";
import type { GameEvents, GamePhase, Notice, RacePlan } from "./hud.ts";
import type { Cast } from "./rider-views.ts";
import type { Stage } from "./scene-lifecycle.ts";

const NOTICE_SECONDS = 0.8;
const SPEECH_SECONDS = 2;
const TAG_RANGE = 25;
const TAG_HEIGHT = 2.2;
const TAG_MARGIN = 0.82;
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
  speech: string;
  speechRider: number;
  speechLeft: number;
  tagRider: number;
  tag: HTMLElement | null;
  muted: boolean;
  readonly tagPoint: THREE.Vector3;
}

export const createFeedback = (): Feedback => ({
  muted: false,
  notice: "",
  noticeDetail: "",
  noticeLeft: 0,
  speech: "",
  speechLeft: 0,
  speechRider: -1,
  tag: null,
  tagPoint: new THREE.Vector3(),
  tagRider: -1,
});

interface FeedbackSession {
  readonly phase: GamePhase;
  readonly plan: RacePlan | null;
  readonly settled: RaceOutcome | null;
  readonly holdLeft: number;
  readonly countdown: number;
}

interface FeedbackParts {
  readonly canvas: HTMLCanvasElement;
  readonly cast: Pick<Cast, "plates" | "views">;
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
  canvas,
  cast,
  chase,
  events,
  feedback,
  player,
  recorder,
  session,
  sound,
  stage,
}: FeedbackParts) => {
  const { tagPoint } = feedback;

  const say = (next: Notice, detail = "") => {
    feedback.notice = next;
    feedback.noticeDetail = detail;
    feedback.noticeLeft = NOTICE_SECONDS;
  };

  const quiet = () => {
    sound.drive(0, 0, 0, false);
    if (feedback.tag) {
      feedback.tag.style.visibility = "hidden";
    }
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

  const reactToHit = (attacker: number, target: number, armed: boolean) => {
    if (attacker === 0) {
      strikeSound(armed);
      const victim = stage.race.view.riders[target];
      if (victim && victim.stamina <= 0) {
        say("knockdown");
      }
    } else if (target === 0) {
      strikeSound(armed);
      chase.jolt(armed ? 0.8 : 0.5);
    }
  };

  const speak = (rider: number, line: "knocksYouDown" | "youKnockThemDown") => {
    const rival = session.plan?.setup.field[rider - 1];
    if (rival === undefined) {
      return;
    }
    feedback.speech = rivalLines[rival][line];
    feedback.speechRider = rider;
    feedback.speechLeft = SPEECH_SECONDS;
  };

  const reactToOwn = (event: RaceEvent) => {
    if (event.kind === "crash") {
      recorder.race("crash", stage.race.view.tick);
      chase.jolt(1);
      sound.crash();
      say("wipeout");
      if (event.cause !== "rider") {
        speak(event.by, "knocksYouDown");
      }
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
    if (event.kind === "riderContact" && event.other === 0) {
      chase.jolt(0.3);
      sound.thump(0.35);
    } else if (event.kind === "weaponTaken" && event.target === 0) {
      say("disarmed");
    } else if (event.kind === "pursuit" && event.target === 0) {
      sound.siren();
      say("police");
    } else if (event.kind === "crash") {
      const fallen = stage.race.view.riders[event.rider];
      if (
        event.cause === "combat" &&
        fallen &&
        Math.abs(fallen.s - player().s) < 30
      ) {
        sound.thump(0.6);
      }
      if (event.by === 0 && event.cause !== "rider") {
        speak(event.rider, "youKnockThemDown");
      }
    }
  };

  const react = () => {
    for (const event of stage.race.view.events) {
      if (event.kind === "hit") {
        reactToHit(event.rider, event.target, event.weapon !== "none");
      } else if (event.rider === 0) {
        reactToOwn(event);
      } else {
        reactToOthers(event);
      }
    }
  };

  const placeTag = () => {
    if (!feedback.tag) {
      return;
    }
    const view = cast.views[feedback.tagRider];
    if (!view || session.phase === "attract" || session.phase === "idle") {
      feedback.tag.style.visibility = "hidden";
      return;
    }
    tagPoint.copy(view.bike.position);
    tagPoint.y += TAG_HEIGHT;
    tagPoint.project(chase.camera);
    if (tagPoint.z > 1) {
      feedback.tag.style.visibility = "hidden";
      return;
    }
    const across = clamp(tagPoint.x, -TAG_MARGIN, TAG_MARGIN) * 0.5 + 0.5;
    const down = 0.5 - clamp(tagPoint.y, -TAG_MARGIN, TAG_MARGIN) * 0.5;
    feedback.tag.style.visibility = "visible";
    feedback.tag.style.transform = `translate3d(${(across * canvas.clientWidth).toFixed(1)}px, ${(down * canvas.clientHeight).toFixed(1)}px, 0) translate(-50%, -100%)`;
  };

  const nearestRacer = (me: RiderView): number => {
    let best = -1;
    let bestGap = TAG_RANGE;
    const { riders } = stage.race.view;
    for (let index = 1; index < riders.length; index += 1) {
      const other = riders[index];
      if (!other || other.profile.role !== "racer" || out(other)) {
        continue;
      }
      const gap = Math.abs(other.s - me.s) + Math.abs(other.x - me.x);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    }
    return best;
  };

  const report = () => {
    const me = player();
    const order = standings(stage.race.view);
    feedback.tagRider =
      feedback.speechLeft > 0 ? feedback.speechRider : nearestRacer(me);
    const rival =
      feedback.tagRider >= 0
        ? stage.race.view.riders[feedback.tagRider]
        : undefined;
    events.onHud({
      bikeName: me.bike.name,
      condition: me.condition / FULL_CONDITION,
      copDistance: chaserDistance(stage.race.view, 0),
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
      position: session.settled?.place ?? order.indexOf(0) + 1,
      progress: clamp(me.bodyS / stage.track.length, 0, 1),
      riderCount: order.length,
      rivalColour: cast.plates[feedback.tagRider] ?? "",
      rivalName: rival?.profile.name ?? "",
      rivalStamina: rival ? rival.stamina / MAX_STAMINA : 0,
      roadLength: stage.track.length,
      roadName: stage.track.plan.name,
      speech: feedback.speechLeft > 0 ? feedback.speech : "",
      speedKmh: me.speed * 3.6,
      stamina: me.stamina / MAX_STAMINA,
      weaponCapacity: weaponCapacity(me),
      weaponHits: me.weaponHits,
      weaponName: weaponName(me),
    });
  };

  return { placeTag, quiet, react, report, say, toggleMute };
};
