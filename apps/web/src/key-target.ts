const TEXT_FIELDS = "input, select, textarea, [contenteditable]";
const CONTROLS = `${TEXT_FIELDS}, a[href], button, [role="radio"], [role="tab"]`;

const focusedOn = (target: EventTarget | null, selectors: string): boolean =>
  target instanceof Element && target.matches(selectors);

export const onTextField = (target: EventTarget | null): boolean =>
  focusedOn(target, TEXT_FIELDS);

export const onControl = (target: EventTarget | null): boolean =>
  focusedOn(target, CONTROLS);
