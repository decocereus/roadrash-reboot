import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createShading } from "../src/game/cel.ts";
import { lookOf, night, sunset } from "../src/game/looks.ts";
import type { Hour } from "../src/game/looks.ts";
import type { Grade } from "../src/game/post.ts";
import { createWorld, lightRace } from "../src/game/world.ts";
import type { World } from "../src/game/world.ts";
import { stubCanvases } from "./canvas-stub.ts";
import { fakeWorldAssets } from "./walker-asset.ts";

interface Seen {
  readonly night: number;
  readonly sunY: number;
  readonly skyFog: string;
  readonly ambient: string;
  readonly sun: string;
  readonly fog: string;
  readonly bloom: number;
  readonly ink: string;
}

const skyOf = (world: World): THREE.ShaderMaterial => {
  const found: THREE.ShaderMaterial[] = [];
  world.scene.traverse((node) => {
    if (
      node instanceof THREE.Mesh &&
      node.material instanceof THREE.ShaderMaterial
    ) {
      found.push(node.material);
    }
  });
  const [sky] = found;
  if (!sky) {
    throw new Error("The world has no sky.");
  }
  return sky;
};

const uniformOf = <Value>(
  sky: THREE.ShaderMaterial,
  name: string,
  kind: abstract new (...args: never[]) => Value
): Value => {
  const value: unknown = sky.uniforms[name]?.value;
  if (!(value instanceof kind)) {
    throw new TypeError(
      `The sky's ${name} uniform holds the wrong kind of value.`
    );
  }
  return value;
};

const numberOf = (sky: THREE.ShaderMaterial, name: string): number => {
  const value: unknown = sky.uniforms[name]?.value;
  return Number(value);
};

const lightOf = <Light extends THREE.Light>(
  world: World,
  kind: new () => Light
): Light => {
  const found = world.scene.children.find(
    (child): child is Light => child instanceof kind
  );
  if (!found) {
    throw new Error("The world is missing a light.");
  }
  return found;
};

const riding = (
  region: Parameters<typeof lookOf>[0],
  road: Parameters<typeof trackFor>[0]
) => {
  const world = createWorld(trackFor(road), fakeWorldAssets());
  const handed: Grade[] = [];
  const post = {
    setLook: (grade: Grade) => {
      handed.push({
        bloom: grade.bloom,
        grade: [grade.grade[0], grade.grade[1], grade.grade[2]],
        ink: `#${new THREE.Color(grade.ink).getHexString()}`,
      });
    },
  };
  const sky = skyOf(world);
  post.setLook(world.clock.hour);
  const at = (tick: number): Seen => {
    lightRace(world, post, { tick }, null);
    const last = handed.at(-1);
    return {
      ambient: lightOf(world, THREE.AmbientLight).color.getHexString(),
      bloom: last?.bloom ?? Number.NaN,
      fog: world.scene.fog?.color.getHexString() ?? "",
      ink: new THREE.Color(last?.ink ?? "#000000").getHexString(),
      night: numberOf(sky, "night"),
      skyFog: uniformOf(sky, "fogColour", THREE.Color).getHexString(),
      sun: lightOf(world, THREE.DirectionalLight).color.getHexString(),
      sunY: uniformOf(sky, "sunAt", THREE.Vector2).y,
    };
  };
  return { at, handed, look: lookOf(region), world };
};

const toneOf = (region: Parameters<typeof lookOf>[0], hour: Hour) => {
  const shading = createShading({ ...lookOf(region), ...hour });
  const tone = {
    ambient: shading.ambient.getHexString(),
    sun: shading.sun.getHexString(),
  };
  shading.dispose();
  return tone;
};

describe("a race's light in the world", () => {
  stubCanvases();

  it("moves the sky, the scene's lights and the post from evening through sunset to night as the race tick runs, and back on a restart", () => {
    const race = riding("salt-coast", "breakwater-run");
    const { nightTick } = race.look;
    const start = race.at(0);
    const atSunset = race.at(Math.round(nightTick * 0.4));
    const atNight = race.at(Math.round(nightTick * 0.85));

    expect({
      night: {
        bloom: atNight.bloom,
        fogInSky: atNight.fog === atNight.skyFog,
        ink: atNight.ink,
        night: atNight.night,
        tone: { ambient: atNight.ambient, sun: atNight.sun },
      },
      start: { bloom: start.bloom, night: start.night },
      sunset: {
        bloom: atSunset.bloom,
        sinking: atSunset.sunY > start.sunY,
        tone: { ambient: atSunset.ambient, sun: atSunset.sun },
      },
    }).toStrictEqual({
      night: {
        bloom: night.bloom,
        fogInSky: true,
        ink: new THREE.Color(night.ink).getHexString(),
        night: 1,
        tone: toneOf("salt-coast", night),
      },
      start: { bloom: race.look.bloom, night: 0 },
      sunset: {
        bloom: sunset.bloom,
        sinking: true,
        tone: toneOf("salt-coast", sunset),
      },
    });
    expect(atNight.fog).not.toBe(start.fog);
    expect(race.at(Math.round(nightTick * 0.4))).toStrictEqual(atSunset);
    expect(race.at(0)).toStrictEqual(start);
  });

  it("gives every client the same light at the same tick, whatever tick it came from", () => {
    const direct = riding("lowtown", "slag-row");
    const stepped = riding("lowtown", "slag-row");
    stepped.at(9000);
    stepped.at(5);
    expect(stepped.at(6)).toStrictEqual(direct.at(6));
    expect(stepped.at(6000)).toStrictEqual(direct.at(6000));
  });

  it("hands the post a new grade only when the light steps", () => {
    const race = riding("stonepeak", "ridge-road");
    const after = race.handed.length;
    race.at(0);
    race.at(1);
    expect(race.handed).toHaveLength(after);
    race.at(race.look.nightTick);
    expect(race.handed).toHaveLength(after + 1);
  });
});
