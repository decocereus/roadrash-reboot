import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BarNav } from "../src/components/screens/bar-chrome.tsx";

const run = vi.fn<() => void>();

const stops = (buyDisabled: boolean, sellDisabled: boolean): string[] =>
  renderToStaticMarkup(
    <BarNav
      actions={[
        { disabled: buyDisabled, id: "buy", label: "Buy", run },
        { disabled: sellDisabled, id: "sell", label: "Sell", run },
        { id: "back", label: "Back", run },
      ]}
      autoFocus={false}
      label="Garage"
      primary="buy"
    />
  )
    .split("<button")
    .filter((button) => button.includes('tabindex="0"'))
    .map((button) => /Buy|Sell|Back/u.exec(button)?.[0] ?? "");

describe("the bar's menu strip", () => {
  it("stops Tab on the primary action while it can be pressed", () => {
    expect(stops(false, false)).toStrictEqual(["Buy"]);
  });

  it("moves the Tab stop to the next action a player can press", () => {
    expect(stops(true, false)).toStrictEqual(["Sell"]);
    expect(stops(true, true)).toStrictEqual(["Back"]);
  });
});
