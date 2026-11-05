import { afterEach, describe, expect, it, vi } from "vitest";

import { createBarInput } from "./bar-input.ts";

const pointer = (type: string, clientX: number): Event =>
  Object.assign(new Event(type), { clientX, clientY: 0 });

const rig = () => {
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => new DOMRect(),
  });
  const page = new EventTarget();
  vi.stubGlobal("addEventListener", page.addEventListener.bind(page));
  vi.stubGlobal("removeEventListener", page.removeEventListener.bind(page));
  const drag = vi.fn<(pixels: number) => void>();
  const input = createBarInput(canvas, {
    action: vi.fn<() => void>(),
    click: vi.fn<() => void>(),
    drag,
    pose: vi.fn<() => void>(),
  });
  return { canvas, drag, input, page };
};

describe("bar input", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ends a drag when the browser cancels the pointer", () => {
    const { canvas, drag, input, page } = rig();
    canvas.dispatchEvent(pointer("pointerdown", 0));
    page.dispatchEvent(pointer("pointermove", 100));
    expect(drag).toHaveBeenCalledOnce();
    expect(input.dragging()).toBeTruthy();
    page.dispatchEvent(pointer("pointercancel", 100));
    expect(input.dragging()).toBeFalsy();
    page.dispatchEvent(pointer("pointermove", 200));
    expect(drag).toHaveBeenCalledOnce();
    input.dispose();
  });
});
