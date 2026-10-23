import { evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
import type { CommandParams } from "@racer/devtools/cdp-protocol";
import { released } from "@racer/devtools/cleanup";
import { UsageError } from "@racer/devtools/usage-error";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { VerificationError } from "./verification-error.ts";

interface KeySpec {
  readonly key: string;
  readonly keyCode: number;
  readonly text: string;
  readonly location: number;
}

const namedKeys = new Map<string, KeySpec>([
  ["ArrowDown", { key: "ArrowDown", keyCode: 40, location: 0, text: "" }],
  ["ArrowLeft", { key: "ArrowLeft", keyCode: 37, location: 0, text: "" }],
  ["ArrowRight", { key: "ArrowRight", keyCode: 39, location: 0, text: "" }],
  ["ArrowUp", { key: "ArrowUp", keyCode: 38, location: 0, text: "" }],
  ["Enter", { key: "Enter", keyCode: 13, location: 0, text: "\r" }],
  ["Escape", { key: "Escape", keyCode: 27, location: 0, text: "" }],
  ["ShiftLeft", { key: "Shift", keyCode: 16, location: 1, text: "" }],
  ["ShiftRight", { key: "Shift", keyCode: 16, location: 2, text: "" }],
  ["Space", { key: " ", keyCode: 32, location: 0, text: " " }],
  ["Tab", { key: "Tab", keyCode: 9, location: 0, text: "" }],
]);

const keySpecOf = (code: string): KeySpec | null => {
  const named = namedKeys.get(code);
  if (named) {
    return named;
  }
  const letter = /^Key(?<letter>[A-Z])$/u.exec(code)?.groups?.letter;
  if (letter !== undefined) {
    return {
      key: letter.toLowerCase(),
      keyCode: letter.codePointAt(0) ?? 0,
      location: 0,
      text: letter.toLowerCase(),
    };
  }
  const digit = /^Digit(?<digit>\d)$/u.exec(code)?.groups?.digit;
  if (digit !== undefined) {
    return {
      key: digit,
      keyCode: digit.codePointAt(0) ?? 0,
      location: 0,
      text: digit,
    };
  }
  return null;
};

const keyOf = (code: string) => {
  const spec = keySpecOf(code);
  return spec === null
    ? Effect.fail(
        new UsageError({
          message: `Unknown key code ${code}. Use KeyboardEvent.code names: ArrowUp, KeyJ, Space, ShiftLeft, Escape.`,
        })
      )
    : Effect.succeed([code, spec] as const);
};

const keyDown = (code: string, spec: KeySpec): CommandParams => {
  const common = {
    code,
    key: spec.key,
    location: spec.location,
    nativeVirtualKeyCode: spec.keyCode,
    windowsVirtualKeyCode: spec.keyCode,
  };
  return spec.text === ""
    ? { ...common, type: "rawKeyDown" }
    : {
        ...common,
        text: spec.text,
        type: "keyDown",
        unmodifiedText: spec.text,
      };
};

const keyUp = (code: string, spec: KeySpec): CommandParams => ({
  code,
  key: spec.key,
  location: spec.location,
  nativeVirtualKeyCode: spec.keyCode,
  type: "keyUp",
  windowsVirtualKeyCode: spec.keyCode,
});

export const press = Effect.fn("rv.press")(function* press(
  page: Session,
  codes: readonly string[],
  holdMs: number
) {
  const specs = yield* Effect.all(codes.map((code) => keyOf(code)));
  const send = (params: (code: string, spec: KeySpec) => CommandParams) =>
    Effect.all(
      specs.map(([code, spec]) =>
        page.send("Input.dispatchKeyEvent", params(code, spec))
      ),
      { concurrency: "unbounded", discard: true }
    );
  yield* Effect.uninterruptibleMask((restore) =>
    send(keyDown).pipe(
      Effect.andThen(
        restore(Effect.sleep(holdMs)).pipe(
          Effect.onInterrupt(() => released(send(keyUp)))
        )
      )
    )
  );
  yield* send(keyUp);
});

const clickTarget = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
  seen: Schema.optionalKey(Schema.Array(Schema.String)),
  x: Schema.optionalKey(Schema.Number),
  y: Schema.optionalKey(Schema.Number),
});

const findControl = (text: string, within: string): string => `(() => {
  const want = ${JSON.stringify(text.toLowerCase())};
  const within = ${JSON.stringify(within)};
  const scope = within === "" ? document : document.querySelector('[aria-label="' + CSS.escape(within) + '"]');
  if (!scope) return { error: "nothing labelled " + within + " is on screen" };
  const lines = (el) => (el.innerText || el.getAttribute("aria-label") || "").split("\\n").map((l) => l.trim().toLowerCase()).filter((l) => l !== "" && l !== "▸");
  const shown = [...scope.querySelectorAll("button, [role=menuitem], [role=button], a[href]")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && !el.closest("[inert]");
  });
  const found = shown.find((el) => lines(el)[0] === want) ?? shown.find((el) => lines(el).includes(want));
  if (!found) return { error: "no visible control reads " + want, seen: shown.map((el) => lines(el).join(" / ")) };
  if (found.disabled || found.getAttribute("aria-disabled") === "true") return { error: want + " is disabled", seen: [lines(found).join(" / ")] };
  const box = found.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const top = document.elementFromPoint(x, y);
  if (!(top && (top === found || found.contains(top)))) return { error: want + " is covered by " + (top ? top.outerHTML.slice(0, 160) : "nothing") };
  return { label: lines(found).join(" / "), x, y };
})()`;

export const click = Effect.fn("rv.click")(function* click(
  page: Session,
  text: string,
  within: string
) {
  const target = yield* evaluate(page, findControl(text, within), clickTarget);
  if (target.error !== undefined || target.x === undefined) {
    const seen =
      target.seen !== undefined && target.seen.length > 0
        ? `; on screen: ${target.seen.join(" | ")}`
        : "";
    return yield* new VerificationError({
      message: `${target.error ?? "no target"}${seen}`,
      operation: "click",
    });
  }
  const at = { x: target.x, y: target.y ?? 0 };
  yield* page.send("Input.dispatchMouseEvent", { ...at, type: "mouseMoved" });
  yield* page.send("Input.dispatchMouseEvent", {
    ...at,
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
  });
  yield* page.send("Input.dispatchMouseEvent", {
    ...at,
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
  });
  return target.label ?? text;
});
