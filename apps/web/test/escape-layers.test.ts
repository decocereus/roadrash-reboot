import { describe, expect, it, vi } from "vitest";

import { createEscapeLayers } from "../src/components/screens/escape-layers.ts";
import type { EscapePress } from "../src/components/screens/escape-layers.ts";

const rig = () => {
  const listening: ((event: EscapePress) => void)[] = [];
  const layers = createEscapeLayers((press) => {
    listening.push(press);
    return () => {
      listening.splice(listening.indexOf(press), 1);
    };
  });
  const escape = (): number => {
    const prevented = { count: 0 };
    for (const press of [...listening]) {
      press({
        key: "Escape",
        preventDefault: () => {
          prevented.count += 1;
        },
        repeat: false,
      });
    }
    return prevented.count;
  };
  return { escape, layers, listening };
};

describe("Esc over stacked layers", () => {
  it("closes only the name card opened over Settings, then Settings", () => {
    const { escape, layers } = rig();
    const closeSettings = vi.fn<() => void>();
    const closeName = vi.fn<() => void>();
    layers.open(closeSettings);
    const nameShut = layers.open(closeName);
    expect(escape()).toBe(1);
    expect(closeName).toHaveBeenCalledOnce();
    expect(closeSettings).not.toHaveBeenCalled();
    nameShut();
    escape();
    expect(closeSettings).toHaveBeenCalledOnce();
    expect(closeName).toHaveBeenCalledOnce();
  });

  it("closes the pause menu's Settings and leaves the race menu under it alone", () => {
    const { escape, layers } = rig();
    const resume = vi.fn<() => void>();
    const closeSettings = vi.fn<() => void>();
    const menuShut = layers.open(resume);
    menuShut();
    const settingsShut = layers.open(closeSettings);
    const closeName = vi.fn<() => void>();
    layers.open(closeName);
    escape();
    expect(closeName).toHaveBeenCalledOnce();
    expect(closeSettings).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    settingsShut();
  });

  it("holds one window listener while any layer is open and none after the last closes", () => {
    const { escape, layers, listening } = rig();
    const shutOne = layers.open(vi.fn<() => void>());
    const shutTwo = layers.open(vi.fn<() => void>());
    expect(listening).toHaveLength(1);
    shutOne();
    shutOne();
    expect(listening).toHaveLength(1);
    shutTwo();
    expect(listening).toHaveLength(0);
    expect(escape()).toBe(0);
  });
});
