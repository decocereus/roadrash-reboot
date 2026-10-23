import {
  MenuItem,
  MenuList,
  MenuStepper,
} from "@racer/ui/components/menu-list";
import type { ComponentProps, ReactNode } from "react";

import { place, stagePx } from "./clubhouse-stage.tsx";
import type { StageBox } from "./clubhouse-stage.tsx";
import { RuledSheet } from "./clubhouse-wall.tsx";
import type { MenuAction } from "./shared.tsx";

const NO_DETAIL = " ";
const SHEET = { h: 691, w: 470, x: 36, y: 110 } as const;
const SHEET_TITLE = { h: 56, w: 400, x: 70, y: 146 } as const;
const SHEET_ROWS = { h: 475, w: 404, x: 84, y: 258 } as const;
const COMPACT_ROWS = { h: 475, w: 404, x: 84, y: 264 } as const;
const LINE = 33.9;

const shifted = (box: StageBox, left: number): StageBox => ({
  ...box,
  x: box.x + left - SHEET.x,
});

export interface PinnedStepper {
  readonly id: string;
  readonly label: string;
  readonly value: ReactNode;
  readonly onStep: ComponentProps<typeof MenuStepper>["onStep"];
}

const PAPER_ITEM =
  "text-ink data-selected:text-ink data-selected:bg-neon-yellow/85 disabled:text-ink/35 w-full rounded-none py-0 !text-[1em] leading-[0.9] tracking-normal";

export const PinnedList = ({
  title,
  label,
  steppers = [],
  actions,
  primary,
  autoFocus,
  left = SHEET.x,
  compact = false,
  onFocusItem,
}: {
  readonly title: string;
  readonly label: string;
  readonly steppers?: readonly PinnedStepper[];
  readonly actions: readonly MenuAction[];
  readonly primary: string;
  readonly autoFocus: boolean;
  readonly left?: number;
  readonly compact?: boolean;
  readonly onFocusItem?: (id: string) => void;
}) => (
  <section aria-label={`${label} list`}>
    <RuledSheet box={shifted(SHEET, left)} scale={0.75} />
    <h1
      className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
      style={{ ...place(shifted(SHEET_TITLE, left)), fontSize: stagePx(38) }}
    >
      {title}
    </h1>
    <MenuList
      autoFocus={autoFocus}
      className="grid -rotate-[0.4deg] content-start items-end gap-0"
      defaultValue={primary}
      label={label}
      onSelect={(id) => actions.find((action) => action.id === id)?.run?.()}
      onValueChange={(id) => onFocusItem?.(id)}
      size="sm"
      style={{
        ...place(shifted(compact ? COMPACT_ROWS : SHEET_ROWS, left)),
        fontSize: stagePx(26),
        gridAutoRows: stagePx(compact ? LINE : LINE * 2),
      }}
    >
      {steppers.map((stepper) => (
        <MenuStepper
          className={`${PAPER_ITEM} [&_[data-slot=menu-step-back]]:text-ink/50 [&_[data-slot=menu-step-forward]]:text-ink/50 [&>span:nth-child(2)]:text-ink/60 self-start [&>span:nth-child(2)]:min-w-[4em] [&>span:nth-child(2)]:text-[0.62em]`}
          key={stepper.id}
          label={stepper.label}
          onStep={stepper.onStep}
          value={stepper.id}
        >
          {stepper.value}
        </MenuStepper>
      ))}
      {actions.map((action) => (
        <MenuItem
          className={`${PAPER_ITEM} [&_[data-slot=menu-detail]]:text-ink/60 [&_[data-slot=menu-trailing]]:text-ink/60 items-start [&_[data-slot=menu-detail]]:mt-[0.45em] [&_[data-slot=menu-detail]]:text-[0.62em] [&_[data-slot=menu-detail]]:leading-none`}
          detail={compact ? undefined : (action.detail ?? NO_DETAIL)}
          disabled={action.disabled}
          key={action.id}
          trailing={action.trailing}
          value={action.id}
        >
          {action.label}
        </MenuItem>
      ))}
    </MenuList>
  </section>
);
