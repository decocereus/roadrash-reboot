import type { KeyboardEvent } from "react";

const FORWARD = new Set(["ArrowDown", "ArrowRight", "s", "S", "d", "D"]);
const BACK = new Set(["ArrowUp", "ArrowLeft", "w", "W", "a", "A"]);

export const focusAfter = (
  key: string,
  current: number,
  count: number
): number | null => {
  if (current < 0 || current >= count) {
    return null;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  if (FORWARD.has(key)) {
    return (current + 1) % count;
  }
  if (BACK.has(key)) {
    return (current - 1 + count) % count;
  }
  return null;
};

export const moveFocus = (event: KeyboardEvent<HTMLElement>): void => {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled)"
    ),
  ];
  const focused = document.activeElement;
  const next = focusAfter(
    event.key,
    focused instanceof HTMLElement ? buttons.indexOf(focused) : -1,
    buttons.length
  );
  const target = next === null ? undefined : buttons[next];
  if (target) {
    event.preventDefault();
    target.focus({ preventScroll: true });
  }
};
