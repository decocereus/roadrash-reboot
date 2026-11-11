import { blockCssOf } from "@racer/sim/palette";
import { useEffect, useRef } from "react";

import { createEscapeLayers } from "./escape-layers.ts";

const escapeLayers = createEscapeLayers((press) => {
  window.addEventListener("keydown", press);
  return () => {
    window.removeEventListener("keydown", press);
  };
});

export const useEscape = (run: () => void, enabled = true): void => {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  }, [run]);
  useEffect(
    () =>
      enabled
        ? escapeLayers.open(() => {
            latest.current();
          })
        : undefined,
    [enabled]
  );
};

export const RiderChip = ({ colour }: { readonly colour: number }) => (
  <span
    aria-hidden
    className="inline-block size-[0.7em] shrink-0 -skew-x-12"
    style={{ background: blockCssOf(colour) }}
  />
);
