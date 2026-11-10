import { blockCssOf } from "@racer/sim/palette";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { createEscapeLayers } from "./escape-layers.ts";

export interface MenuAction {
  readonly id: string;
  readonly label: string;
  readonly detail?: ReactNode;
  readonly trailing?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly run?: (() => void) | undefined;
}

export const ActionMenu = ({
  label,
  actions,
  primary,
  orientation = "horizontal",
  size = "sm",
  autoFocus = true,
  className,
  onKeyDown,
}: {
  readonly label: string;
  readonly actions: readonly MenuAction[];
  readonly primary: string;
  readonly orientation?: "horizontal" | "vertical";
  readonly size?: "sm" | "md";
  readonly autoFocus?: boolean;
  readonly className?: string | undefined;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) => (
  <MenuList
    autoFocus={autoFocus}
    className={className}
    defaultValue={primary}
    label={label}
    onKeyDown={onKeyDown}
    onSelect={(id) => actions.find((action) => action.id === id)?.run?.()}
    orientation={orientation}
    size={size}
  >
    {actions.map((action) => (
      <MenuItem
        detail={action.detail}
        disabled={action.disabled === true}
        key={action.id}
        trailing={action.trailing}
        value={action.id}
      >
        {action.label}
      </MenuItem>
    ))}
  </MenuList>
);

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

export const standingTag = (
  ally: boolean,
  grudge: boolean
): string | undefined => {
  if (ally) {
    return "On your side";
  }
  if (grudge) {
    return "Holds a grudge";
  }
  return undefined;
};

export const RiderChip = ({ colour }: { readonly colour: number }) => (
  <span
    aria-hidden
    className="inline-block size-[0.7em] shrink-0 -skew-x-12"
    style={{ background: blockCssOf(colour) }}
  />
);
