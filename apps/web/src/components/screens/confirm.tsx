import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

import { place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { RuledSheet, ruledLines, SheetTitle } from "./clubhouse-wall.tsx";

const SLIP = { h: 420, w: 560, x: 556, y: 240 } as const;
const SCALE = 0.75;

interface ConfirmOption {
  readonly value: string;
  readonly label: string;
}

export const Confirm = ({
  label,
  warning,
  options,
  defaultValue,
  onSelect,
  onDismiss,
  children,
}: {
  readonly label: string;
  readonly warning?: ReactNode;
  readonly options: readonly ConfirmOption[];
  readonly defaultValue: string;
  readonly onSelect: (value: string) => void;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) => {
  const [held] = useState<{ opener: Element | null }>(() => ({ opener: null }));
  useLayoutEffect(() => {
    held.opener ??= document.activeElement;
  }, [held]);
  useEffect(
    () => () => {
      if (held.opener instanceof HTMLElement && held.opener.isConnected) {
        held.opener.focus({ preventScroll: true });
      }
    },
    [held]
  );
  const lines = ruledLines(SLIP, SCALE);
  const line = stagePx(lines.gap);
  return (
    <div
      aria-label={label}
      aria-modal
      className="bg-ink/70 notice-in absolute inset-0 z-50 flex"
      data-slot="confirm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDismiss();
        }
      }}
      role="alertdialog"
    >
      <Stage>
        <RuledSheet box={SLIP} scale={SCALE} />
        <SheetTitle box={SLIP} scale={SCALE}>
          {label}
        </SheetTitle>
        <div
          className="font-display text-ink flex -rotate-[0.4deg] flex-col font-bold"
          style={{
            ...place({
              h: SLIP.h - lines.top + SLIP.y,
              w: lines.width,
              x: lines.left,
              y: lines.top,
            }),
            fontSize: stagePx(lines.gap * 0.74),
            lineHeight: line,
          }}
        >
          <p className="text-pretty">{children}</p>
          {warning !== undefined && (
            <p className="text-neon-red uppercase">{warning}</p>
          )}
          <MenuList
            autoFocus
            className="flex-nowrap gap-x-[1.4em]"
            defaultValue={defaultValue}
            label={label}
            onSelect={onSelect}
            orientation="horizontal"
            size="sm"
            style={{ marginTop: line }}
          >
            {options.map((option) => (
              <MenuItem
                className="text-ink data-selected:text-ink data-selected:bg-neon-yellow/85 items-end rounded-none px-[0.3em] py-0 !text-[1.15em] leading-none tracking-normal"
                key={option.value}
                style={{ height: line }}
                value={option.value}
              >
                {option.label}
              </MenuItem>
            ))}
          </MenuList>
        </div>
      </Stage>
    </div>
  );
};
