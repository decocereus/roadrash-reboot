import * as THREE from "three";
import { describe, expect, it } from "vitest";

import "./cel.ts";
import { pixelRatioFor, presetFor, presets } from "./presets.ts";

const UHD_630 =
  "ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)";

describe("device presets", () => {
  it("draws a UHD 630 at 0.7 of a 1080p screen, with half-size glow and far riders", () => {
    const preset = presetFor(UHD_630);
    expect(preset.id).toBe("lean");
    expect(pixelRatioFor(preset, 1, 1920, 1080)).toBeCloseTo(0.7, 6);
    expect(preset.bloomScale).toBe(presets.balanced.bloomScale / 2);
    expect(preset.farRiders).toBeTruthy();
  });

  it("keeps full bodies on every other preset", () => {
    expect(presets.balanced.farRiders).toBeFalsy();
    expect(presets.full.farRiders).toBeFalsy();
  });
});

describe("shadow kernel", () => {
  it("takes nine samples everywhere", () => {
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
    expect(chunk).toContain("( 1.0 / 9.0 )");
    expect(chunk).not.toContain("( 1.0 / 17.0 )");
  });
});
