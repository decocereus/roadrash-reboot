const TEXT_FIELDS = "input, select, textarea, [contenteditable]";
const CONTROLS = `a[href], button, [role="radio"], [role="tab"]`;

const controlKeys: ReadonlySet<string> = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Enter",
  "NumpadEnter",
  "Space",
]);

const focusedOn = (target: EventTarget | null, selectors: string): boolean =>
  target instanceof Element && target.matches(selectors);

export const onTextField = (target: EventTarget | null): boolean =>
  focusedOn(target, TEXT_FIELDS);

export const keptByControl = (
  target: EventTarget | null,
  code: string
): boolean =>
  onTextField(target) || (controlKeys.has(code) && focusedOn(target, CONTROLS));
