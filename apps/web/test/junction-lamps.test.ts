import {
  crossLightOf,
  isSignalled,
  mainLightOf,
  signalPhaseAt,
} from "@racer/sim/signals";
import type { LightColour } from "@racer/sim/signals";
import { roadHalfWidthAt } from "@racer/track/districts";
import { trackFor } from "@racer/track/roads";
import { placeOnTrack } from "@racer/track/track";
import type { TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createShading } from "../src/game/cel.ts";
import { createClearance } from "../src/game/clearance.ts";
import { buildJunctions } from "../src/game/junctions.ts";
import { lookOf } from "../src/game/looks.ts";
import { isMesh } from "../src/game/meshes.ts";

const LAMP_VERTICES = 6;
const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

const track = trackFor("breakwater-run");
const harbour = track.crossings.find(({ id }) => id === "harbour-cross");
if (!harbour || !isSignalled(harbour)) {
  throw new Error("Breakwater Run has a signalled Harbour Cross.");
}

const colourOf = (r: number, g: number): LightColour => {
  if (g > r) {
    return "green";
  }
  return g < 0.2 * r ? "red" : "amber";
};

const byName = (a: string, b: string): number => a.localeCompare(b);

interface Lamp {
  readonly colour: LightColour;
  readonly height: number;
}

interface SignalMeshes {
  readonly solid: THREE.Mesh;
  readonly glow: THREE.Mesh;
}

const harbourMeshes = (group: THREE.Group): SignalMeshes => {
  const meshes: THREE.Mesh[] = [];
  group.traverse((node) => {
    if (isMesh(node)) {
      meshes.push(node);
    }
  });
  placeOnTrack(track, harbour.s, 0, point);
  const near = meshes.filter((mesh) => {
    mesh.geometry.computeBoundingSphere();
    const centre = mesh.geometry.boundingSphere?.center;
    return (
      centre !== undefined &&
      Math.hypot(centre.x - point.x, centre.z - point.z) < 30
    );
  });
  const glow = near.find(
    (mesh) => mesh.material instanceof THREE.MeshBasicMaterial
  );
  const solid = near.find(
    (mesh) =>
      mesh.castShadow && !(mesh.material instanceof THREE.MeshBasicMaterial)
  );
  if (!glow || !solid) {
    throw new Error("Harbour Cross has a merged signal mesh and glow mesh.");
  }
  return { glow, solid };
};

const lampsOf = (glow: THREE.Mesh): Lamp[] => {
  const positions = glow.geometry.getAttribute("position");
  const colours = glow.geometry.getAttribute("color");
  const lamps: Lamp[] = [];
  for (let vertex = 0; vertex < colours.count; vertex += 1) {
    const brightest = Math.max(
      colours.getX(vertex),
      colours.getY(vertex),
      colours.getZ(vertex)
    );
    if (brightest > 1.5) {
      let height = 0;
      for (let corner = 0; corner < LAMP_VERTICES; corner += 1) {
        height += positions.getY(vertex + corner) / LAMP_VERTICES;
      }
      lamps.push({
        colour: colourOf(colours.getX(vertex), colours.getY(vertex)),
        height,
      });
      vertex += LAMP_VERTICES - 1;
    }
  }
  return lamps;
};

const drawnShare = (mesh: THREE.Mesh): number => {
  const index = mesh.geometry.getIndex();
  if (!index) {
    throw new Error("A merged signal mesh draws through an index.");
  }
  let drawn = 0;
  for (let at = 0; at < index.count; at += 1) {
    if (index.getX(at) === at) {
      drawn += 1;
    }
  }
  return drawn / index.count;
};

describe("merged junction signals", () => {
  it("light the lamp each head's phase calls for, in that colour's slot", () => {
    const shading = createShading(lookOf(track.plan.region));
    const junctions = buildJunctions(track, shading, createClearance());
    const { glow } = harbourMeshes(junctions.group);
    const heads = harbour.road ? 4 : 2;
    const seen = new Map<LightColour, number[]>();
    for (let tick = 0; tick < 60 * 120; tick += 15) {
      junctions.show(tick);
      const phase = signalPhaseAt(harbour, tick);
      const main = mainLightOf(phase);
      const cross = crossLightOf(phase);
      const lamps = lampsOf(glow);
      expect(lamps).toHaveLength(heads);
      const expected = [main, main, ...(harbour.road ? [cross, cross] : [])];
      expect(lamps.map(({ colour }) => colour).toSorted(byName)).toStrictEqual(
        expected.toSorted(byName)
      );
      const [first] = lamps;
      if (first?.colour === main) {
        seen.set(main, [...(seen.get(main) ?? []), first.height]);
      }
    }
    const heightOf = (colour: LightColour): number =>
      seen.get(colour)?.[0] ?? Number.NaN;
    expect([...seen.keys()].toSorted(byName)).toStrictEqual([
      "amber",
      "green",
      "red",
    ]);
    expect(heightOf("red")).toBeGreaterThan(heightOf("amber"));
    expect(heightOf("amber")).toBeGreaterThan(heightOf("green"));
    junctions.dispose();
    shading.dispose();
  });

  it("hide a signal the chase camera reaches by its spans in the merged meshes, and bring it back", () => {
    const shading = createShading(lookOf(track.plan.region));
    const clearance = createClearance();
    const junctions = buildJunctions(track, shading, clearance);
    const { glow, solid } = harbourMeshes(junctions.group);
    expect([drawnShare(solid), drawnShare(glow)]).toStrictEqual([1, 1]);

    const half = roadHalfWidthAt(track, harbour.s);
    placeOnTrack(track, harbour.s - (harbour.stopGap + 0.3), half + 0.9, point);
    clearance.follow(new THREE.Vector3(point.x, point.y + 3, point.z));
    const hiddenSolid = drawnShare(solid);
    const hiddenGlow = drawnShare(glow);
    expect(hiddenSolid).toBeLessThan(1);
    expect(hiddenSolid).toBeGreaterThan(0.5);
    expect(hiddenGlow).toBeLessThan(1);

    clearance.follow(new THREE.Vector3(point.x, point.y + 400, point.z));
    expect([drawnShare(solid), drawnShare(glow)]).toStrictEqual([1, 1]);
    junctions.dispose();
    shading.dispose();
  });
});
