import { useCallback, useEffectEvent, useRef, useState } from "react";

import type { Step } from "../race-handoff.ts";

interface Handoff<State, Event> {
  readonly now: () => State;
  readonly send: (event: Event) => void;
  readonly state: State;
}

export const useHandoff = <State, Event, Effect>(
  step: (state: State, event: Event) => Step<State, Effect>,
  first: () => State,
  run: (effect: Effect) => void
): Handoff<State, Event> => {
  const [state, setState] = useState(first);
  const latest = useRef(state);
  const runEffect = useEffectEvent(run);
  const send = useCallback(
    (event: Event): void => {
      const next = step(latest.current, event);
      latest.current = next.state;
      setState(next.state);
      if (next.effect !== null) {
        runEffect(next.effect);
      }
    },
    [step]
  );
  const now = useCallback(() => latest.current, []);
  return { now, send, state };
};
