import { afterEach, describe, expect, it, vi } from "vitest";

import { createBarInput } from "./bar-input.ts";

const pointer = (type: string, clientX: number): Event =>
  Object.assign(new Event(type), { clientX, clientY: 0 });

const key = (type: string, code: string, metaKey: boolean): Event =>
  Object.assign(new Event(type), { code, metaKey, repeat: false });

const rig = () => {
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => new DOMRect(),
  });
  const page = new EventTarget();
  vi.stubGlobal("addEventListener", page.addEventListener.bind(page));
  vi.stubGlobal("removeEventListener", page.removeEventListener.bind(page));
  const drag = vi.fn<(pixels: number) => void>();
  const action = vi.fn<() => void>();
  const input = createBarInput(canvas, {
    action,
    click: vi.fn<() => void>(),
    drag,
    pose: vi.fn<() => void>(),
  });
  return { action, canvas, drag, input, page };
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

  it("leaves a press under Cmd to the browser, as Cmd+R reloads without a rev", () => {
    const { action, input, page } = rig();
    page.dispatchEvent(key("keydown", "MetaLeft", true));
    page.dispatchEvent(key("keydown", "KeyR", true));
    page.dispatchEvent(key("keydown", "KeyW", true));
    expect(action).not.toHaveBeenCalled();
    expect(input.control().forward).toBe(0);
    input.dispose();
  });

  it("lets go of a key held since before Cmd when Cmd is released, as Cmd may swallow its release", () => {
    const { input, page } = rig();
    page.dispatchEvent(key("keydown", "KeyW", false));
    page.dispatchEvent(key("keydown", "MetaLeft", true));
    expect(input.control().forward).toBe(1);
    page.dispatchEvent(key("keyup", "MetaLeft", false));
    expect(input.control().forward).toBe(0);
    input.dispose();
  });
});
