import { MenuItem, MenuList } from "@racer/ui/components/menu-list";

import { place, stagePx } from "./clubhouse-stage.tsx";
import { RuledSheet } from "./clubhouse-wall.tsx";
import type { MenuAction } from "./shared.tsx";

const NO_DETAIL = " ";
const SHEET = { h: 691, w: 470, x: 36, y: 110 } as const;
const SHEET_TITLE = { h: 56, w: 400, x: 70, y: 146 } as const;
const SHEET_ROWS = { h: 475, w: 404, x: 84, y: 258 } as const;

export const PinnedList = ({
  title,
  label,
  actions,
  primary,
  autoFocus,
}: {
  readonly title: string;
  readonly label: string;
  readonly actions: readonly MenuAction[];
  readonly primary: string;
  readonly autoFocus: boolean;
}) => (
  <section aria-label={`${label} list`}>
    <RuledSheet box={SHEET} scale={0.75} />
    <h1
      className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
      style={{ ...place(SHEET_TITLE), fontSize: stagePx(38) }}
    >
      {title}
    </h1>
    <MenuList
      autoFocus={autoFocus}
      className="grid -rotate-[0.4deg] content-start items-end gap-0"
      defaultValue={primary}
      label={label}
      onSelect={(id) => actions.find((action) => action.id === id)?.run?.()}
      size="sm"
      style={{
        ...place(SHEET_ROWS),
        fontSize: stagePx(26),
        gridAutoRows: stagePx(67.8),
      }}
    >
      {actions.map((action) => (
        <MenuItem
          className="text-ink data-selected:text-ink data-selected:bg-neon-yellow/85 [&_[data-slot=menu-detail]]:text-ink/60 [&_[data-slot=menu-trailing]]:text-ink/60 w-full items-start rounded-none py-0 !text-[1em] leading-[0.9] tracking-normal [&_[data-slot=menu-detail]]:mt-[0.45em] [&_[data-slot=menu-detail]]:text-[0.62em] [&_[data-slot=menu-detail]]:leading-none"
          detail={action.detail ?? NO_DETAIL}
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
