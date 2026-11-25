import { riderIdAt } from "@racer/sim/state";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTowerPass } from "../src/game/hud-tower-pass.ts";
import type { TowerRow } from "../src/game/hud.ts";
import {
  consumingRenderer,
  meshOf,
  motionPreference,
  recordingCanvases,
} from "./tower-pass-stubs.ts";

const WIDTH = 1919;
const HEIGHT = 992;
const SLIDE_START_MS = 1000;
const CSS_SKEW_X_MINUS_12_DEG = -0.212557;
const DEVICE_RATIO = 2;

const rowsOf = (names: readonly string[], tenths = 3): TowerRow[] =>
  names.map((name, at) => ({
    chip: 0xff_ff_ff,
    finished: false,
    id: riderIdAt(at),
    mark: at === 0 ? "lead" : "gap",
    name,
    place: at + 1,
    tenths,
    you: at === 0,
  }));

const reordered = (rows: readonly TowerRow[]): TowerRow[] =>
  rows.toReversed().map((row, at) => ({
    ...row,
    mark: at === 0 ? "lead" : "gap",
    place: at + 1,
  }));

const namesOf = (rows: readonly TowerRow[]) =>
  new Map(rows.map((row) => [row.id, row.name]));

const passWith = (ratio = 1) => {
  const canvases = recordingCanvases();
  const motion = motionPreference();
  const clock = { now: 0 };
  const readClock = () => clock.now;
  vi.stubGlobal("document", { createElement: canvases.createElement });
  vi.stubGlobal("matchMedia", () => motion.media);
  vi.stubGlobal("devicePixelRatio", ratio);
  vi.spyOn(performance, "now").mockImplementation(readClock);
  const drawing = consumingRenderer();
  const pass = createTowerPass(drawing.renderer);
  pass.compile();
  const [scene] = drawing.scenes;
  if (!scene) {
    throw new Error("The tower pass compiled no scene.");
  }
  const mesh = meshOf(scene);
  const attributes = Object.values(mesh.geometry.attributes).filter(
    (attribute) => attribute instanceof THREE.BufferAttribute
  );
  pass.resize(WIDTH, HEIGHT, ratio);
  return { attributes, canvases, clock, drawing, mesh, motion, pass };
};

const positionsOf = (mesh: THREE.Mesh): readonly number[] => {
  const { position } = mesh.geometry.attributes;
  return position instanceof THREE.BufferAttribute ? [...position.array] : [];
};

describe("the timing tower's pass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uploads a changed row through one kept range record per attribute and paints nothing", () => {
    const { attributes, canvases, drawing, pass } = passWith();
    const rows = rowsOf(["You", "Rival"]);
    pass.bake(namesOf(rows));
    pass.show(rows);
    pass.render();
    const records = attributes.map((attribute) => attribute.updateRanges[0]);
    const layers = canvases.layers();
    const { uploaded } = drawing.state;
    pass.show(rowsOf(["You", "Rival"], 4));
    pass.render();
    expect({
      layers: canvases.layers(),
      moved: drawing.state.uploaded > uploaded,
      same: attributes.map(
        (attribute, at) =>
          attribute.updateRanges.length === 1 &&
          attribute.updateRanges[0] === records[at]
      ),
    }).toStrictEqual({
      layers,
      moved: true,
      same: [true, true, true, true],
    });
  });

  it("keeps its names and atlas when a bake fails, then the retry paints and the first draw does not", () => {
    const { canvases, pass } = passWith();
    const rows = rowsOf(["You", "Rival"]);
    pass.bake(namesOf(rows));
    const renamed = rowsOf(["You", "New rival"]);
    canvases.refuseNextRead();
    expect(() => {
      pass.bake(namesOf(renamed));
    }).toThrow("The test canvas refused the atlas read.");
    const failed = canvases.layers();
    pass.bake(namesOf(renamed));
    const retried = canvases.layers();
    pass.show(renamed);
    pass.render();
    expect({
      drawn: canvases.layers() - retried,
      retried: retried - failed,
    }).toStrictEqual({ drawn: 0, retried: 3 });
  });

  it("restores the renderer's clear and the tower's visibility when its draw throws, staged or not", () => {
    const { drawing, mesh, pass } = passWith();
    const rows = rowsOf(["You", "Rival"]);
    pass.bake(namesOf(rows));
    drawing.state.failing = true;
    const unstage = pass.stage();
    expect(() => {
      pass.render();
    }).toThrow("The test renderer failed the draw.");
    const staged = {
      autoClear: drawing.renderer.autoClear,
      shown: mesh.visible,
    };
    unstage();
    pass.show(rows);
    expect(() => {
      pass.render();
    }).toThrow("The test renderer failed the draw.");
    expect({
      racing: { autoClear: drawing.renderer.autoClear, shown: mesh.visible },
      staged,
    }).toStrictEqual({
      racing: { autoClear: true, shown: false },
      staged: { autoClear: true, shown: true },
    });
  });

  it("snaps a sliding row into place when the player turns on reduced motion mid-slide, and lets go of the preference on dispose", () => {
    const { clock, mesh, motion, pass } = passWith();
    const rows = rowsOf(["You", "Rival", "Third"]);
    pass.bake(namesOf(rows));
    pass.show(rows);
    pass.render();
    clock.now = SLIDE_START_MS;
    pass.show(reordered(rows));
    pass.render();
    clock.now = SLIDE_START_MS + 20;
    pass.render();
    const sliding = positionsOf(mesh);
    motion.change(true);
    clock.now = SLIDE_START_MS + 40;
    pass.render();
    const snapped = positionsOf(mesh);
    clock.now = SLIDE_START_MS + 400;
    pass.render();
    const listening = motion.listeners.size;
    pass.dispose();
    expect({
      listening,
      moved: snapped.some((value, at) => value !== sliding[at]),
      released: motion.listeners.size,
      settled: positionsOf(mesh),
    }).toStrictEqual({
      listening: 1,
      moved: true,
      released: 0,
      settled: snapped,
    });
  });

  it("says it is sliding until a swapped row reaches its slot or the tower draws no rows, so a paused game draws only that far", () => {
    const { clock, pass } = passWith();
    const rows = rowsOf(["You", "Rival", "Third"]);
    pass.bake(namesOf(rows));
    pass.show(rows);
    pass.render();
    const still = pass.sliding();
    clock.now = SLIDE_START_MS;
    pass.show(reordered(rows));
    pass.render();
    clock.now = SLIDE_START_MS + 150;
    pass.render();
    const midway = pass.sliding();
    clock.now = SLIDE_START_MS + 400;
    pass.render();
    const settled = pass.sliding();
    pass.show(rows);
    pass.render();
    clock.now = SLIDE_START_MS + 450;
    pass.render();
    const again = pass.sliding();
    pass.show([]);
    pass.render();
    expect({
      again,
      gone: pass.sliding(),
      midway,
      settled,
      still,
    }).toStrictEqual({
      again: true,
      gone: false,
      midway: true,
      settled: false,
      still: false,
    });
  });

  it("paints each chip skewed by 12 degrees with a whole-pixel outline, and inks text 2 page pixels out", () => {
    const { canvases, pass } = passWith(DEVICE_RATIO);
    pass.bake(namesOf(rowsOf(["You", "Rival"])));
    const { drawings } = canvases;
    const skews = drawings.filter((drawing) => drawing.call === "setTransform");
    const outlines = skews.map((skew) =>
      drawings.find(
        (drawing) =>
          drawing.layer === skew.layer &&
          drawing.call === "strokeRect" &&
          drawings.indexOf(drawing) > drawings.indexOf(skew)
      )
    );
    const texts = drawings.filter((drawing) => drawing.call === "fillText");
    const [fill] = texts;
    const inks = texts.filter(
      (drawing) => drawing.layer !== fill?.layer && (drawing.args[0] ?? 0) > 0
    );
    expect({
      outline: outlines.filter(Boolean).map((outline) => outline?.lineWidth),
      skews: skews.map((skew) =>
        skew.args.slice(0, 4).map((value) => Math.round(value * 1e6) / 1e6)
      ),
      text: inks
        .slice(0, 4)
        .map((ink) => [
          (ink.args[0] ?? 0) - (fill?.args[0] ?? 0),
          (ink.args[1] ?? 0) - (fill?.args[1] ?? 0),
        ]),
    }).toStrictEqual({
      outline: [2],
      skews: [0, 1].map(() => [1, 0, CSS_SKEW_X_MINUS_12_DEG, 1]),
      text: [
        [-4, 0],
        [4, 0],
        [0, -4],
        [0, 4],
      ],
    });
  });
});
