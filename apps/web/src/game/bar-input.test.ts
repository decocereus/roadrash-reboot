import { afterEach, describe, expect, it, vi } from "vitest";

import { createBarInput } from "./bar-input.ts";

const pointer = (type: string, clientX: number): Event =>
  Object.assign(new Event(type), { clientX, clientY: 0 });

class FocusedElement extends EventTarget {
  readonly #selectors: readonly string[];

  constructor(...selectors: readonly string[]) {
    super();
    this.#selectors = selectors;
  }

  matches(selectors: string): boolean {
    return this.#selectors.some((one) => selectors.split(", ").includes(one));
  }
}

const key = (
  type: string,
  code: string,
  metaKey: boolean,
  focused: FocusedElement | null = null
): Event =>
  Object.defineProperty(
    Object.assign(new Event(type), { code, metaKey, repeat: false }),
    "target",
    { value: focused }
  );

const rig = () => {
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => new DOMRect(),
  });
  const page = new EventTarget();
  vi.stubGlobal("addEventListener", page.addEventListener.bind(page));
  vi.stubGlobal("removeEventListener", page.removeEventListener.bind(page));
  vi.stubGlobal("Element", FocusedElement);
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

  it("leaves a name typed into a field alone, so typing a name never walks or shoves", () => {
    const { action, input, page } = rig();
    const field = new FocusedElement("input");
    page.dispatchEvent(key("keydown", "KeyW", false, field));
    page.dispatchEvent(key("keydown", "KeyE", false, field));
    expect(input.control().forward).toBe(0);
    expect(action).not.toHaveBeenCalled();
    input.dispose();
  });

  it("leaves the arrows on a focused option chip or button to it, so the rider stands still", () => {
    const { input, page } = rig();
    const chip = new FocusedElement("button", '[role="radio"]');
    page.dispatchEvent(key("keydown", "ArrowRight", false, chip));
    page.dispatchEvent(key("keydown", "ArrowUp", false, chip));
    expect(input.control()).toStrictEqual({
      forward: 0,
      right: 0,
      sprint: false,
    });
    page.dispatchEvent(
      key("keydown", "ArrowUp", false, new FocusedElement("body"))
    );
    expect(input.control().forward).toBe(1);
    input.dispose();
  });

  it("walks and acts on letters pressed while a clicked tab or button keeps focus", () => {
    const { action, input, page } = rig();
    const tab = new FocusedElement("button", '[role="tab"]');
    page.dispatchEvent(key("keydown", "KeyW", false, tab));
    page.dispatchEvent(key("keydown", "KeyD", false, tab));
    page.dispatchEvent(
      key("keydown", "KeyE", false, new FocusedElement("button"))
    );
    expect({
      acted: action.mock.calls.length,
      control: input.control(),
    }).toStrictEqual({
      acted: 1,
      control: { forward: 1, right: 1, sprint: false },
    });
    input.dispose();
  });
});
