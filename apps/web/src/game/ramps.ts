import { emptySupport, lipOf, supportAt } from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import type { Clearance } from "./clearance.ts";
import { freeze } from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { buildAccents, buildDeck, buildEdges } from "./ramp-deck.ts";
import {
  buildFrame,
  buildLip,
  buildShadow,
  buildVoid,
  SHADOW_AHEAD,
} from "./ramp-frame.ts";
import { emptySheet, facingAt, geometryOf } from "./ramp-geometry.ts";
import type { Lift, Ramp } from "./ramp-geometry.ts";
import {
  BEACON_OUT,
  buildBeacon,
  buildChevrons,
  buildWarning,
  CHEVRON_BAR,
  CHEVRON_DEPTH,
  CHEVRON_GAPS,
  SIGN_BEFORE,
} from "./ramp-markers.ts";
import { meshesOf, shadowMaterial } from "./ramp-materials.ts";
import type { Materials } from "./ramp-materials.ts";

const PLATE = 0.14;
const SHOWN_AFTER = 2;

export interface Ramps {
  readonly group: THREE.Group;
  readonly stretches: readonly Stretch[];
}

const support = emptySupport();

const rampOf = (track: Track, jump: TrackFeature, index: number): Ramp => {
  const heightOf: Lift = (s) => {
    supportAt(track, s, jump.x, support);
    return support.feature === index ? support.height : 0;
  };
  return {
    facing: facingAt(track, jump.s, jump.x),
    heightOf,
    jump,
    left: jump.x - jump.width / 2,
    right: jump.x + jump.width / 2,
    track,
    underOf: (s) => Math.max(0, heightOf(Math.min(s, lipOf(jump))) - PLATE),
  };
};

const buildRamp = (
  ramp: Ramp,
  materials: Materials,
  clearance: Clearance
): THREE.Group => {
  const solid = emptySheet();
  const glow = emptySheet();
  const shadow = emptySheet(true);
  buildDeck(ramp, solid);
  buildEdges(ramp, solid);
  buildFrame(ramp, solid);
  buildVoid(ramp, solid);
  buildLip(ramp, solid);
  buildAccents(ramp, glow);
  buildChevrons(ramp, glow);
  buildShadow(ramp, shadow);
  const body = meshesOf(solid, glow, materials);
  body.add(onFxLayer(new THREE.Mesh(geometryOf(shadow), materials.shade)));
  for (const x of [ramp.left - BEACON_OUT, ramp.right + BEACON_OUT]) {
    const beacon = buildBeacon(ramp, x, materials);
    body.add(beacon);
    clearance.addObject(beacon);
  }
  return freeze(body);
};

export const buildRamps = (
  track: Track,
  shading: Shading,
  clearance: Clearance
): Ramps => {
  const group = new THREE.Group();
  const stretches: Stretch[] = [];
  if (track.features.length === 0) {
    return { group, stretches };
  }
  const materials: Materials = {
    cel: shading.cel("#ffffff", { rim: 0, vertexColors: true }),
    light: shading.glowPaint(),
    shade: shadowMaterial(),
  };
  const firstChevron = Math.max(...CHEVRON_GAPS) + CHEVRON_DEPTH + CHEVRON_BAR;
  for (let index = 0; index < track.features.length; index += 1) {
    const jump = track.features[index];
    if (!jump) {
      continue;
    }
    const ramp = rampOf(track, jump, index);
    const body = buildRamp(ramp, materials, clearance);
    const warning = buildWarning(ramp, materials);
    clearance.addObject(warning);
    group.add(body, warning);
    stretches.push(
      {
        from: jump.s - firstChevron,
        object: body,
        to: lipOf(jump) + SHADOW_AHEAD + SHOWN_AFTER,
      },
      {
        from: jump.s - SIGN_BEFORE - 1,
        object: warning,
        to: jump.s - SIGN_BEFORE + 1,
      }
    );
  }
  return { group, stretches };
};
