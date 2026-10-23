import { roadsFor } from "@racer/career/field";
import { debtOf } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { formatMoney } from "@racer/ui/components/money";
import { cn } from "@racer/ui/utils";
import type { KeyboardEvent, ReactNode } from "react";

import { plates } from "../../assets/clubhouse-art.ts";
import { levelName } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import { Plate, place, stagePx } from "./clubhouse-stage.tsx";

const WORDMARK = { h: 106, w: 405, x: 30, y: 16 } as const;
const BADGE = { h: 98, w: 82, x: 438, y: 24 } as const;
const STATUS = { h: 63, w: 1127, x: 522, y: 33 } as const;
const NAV = { h: 71, w: 1672, x: 0, y: 854 } as const;

const StatusItem = ({
  label,
  children,
  tone,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly tone: string;
}) => (
  <p className="flex items-baseline gap-[0.35em] whitespace-nowrap">
    <span className={tone}>{label}</span>
    <span>{children}</span>
  </p>
);

const StatusStrip = ({ career }: { readonly career: CareerState }) => {
  const board = roadsFor(career);
  return (
    <div
      className="bg-ink/85 font-display text-paper flex items-center justify-around border-y border-white/10 font-bold tracking-wide uppercase"
      style={{ ...place(STATUS), fontSize: stagePx(27) }}
    >
      <StatusItem label={`Level ${career.level} ·`} tone="text-neon-cyan">
        {levelName(career.level)}
      </StatusItem>
      <StatusItem label="Roads" tone="text-neon-yellow">
        <span className="text-neon-yellow">
          {board.qualifiedCount} / {board.roads.length} qualified
        </span>
      </StatusItem>
      <StatusItem
        label={debtOf(career) > 0 ? "Owed" : "Cash"}
        tone="text-paper/75"
      >
        <span className="text-neon-red numeric">
          {formatMoney(Math.abs(career.cash))}
        </span>
      </StatusItem>
      <p className="text-neon-yellow whitespace-nowrap">
        {bikeName(career.bikeId)}
      </p>
    </div>
  );
};

export const BarHeader = ({
  career,
}: {
  readonly career: CareerState | null;
}) => (
  <>
    <h1
      className="font-stencil text-paper flex items-center leading-none font-black whitespace-nowrap uppercase drop-shadow-[0_0.06em_0_rgb(0_0_0/60%)]"
      style={{ ...place(WORDMARK), fontSize: stagePx(84) }}
    >
      The Lowside
    </h1>
    <Plate box={BADGE} src={plates.badge} />
    {career && <StatusStrip career={career} />}
  </>
);

export const BarStrip = ({
  opaque = false,
  children,
}: {
  readonly opaque?: boolean;
  readonly children: ReactNode;
}) => (
  <nav
    className={cn(
      "font-display flex items-center justify-between border-y border-white/10 px-[3.6cqw] font-bold uppercase",
      opaque ? "bg-ink" : "bg-ink/90"
    )}
    style={{ ...place(NAV), fontSize: stagePx(33) }}
  >
    {children}
  </nav>
);

export interface BarAction {
  readonly id: string;
  readonly label: ReactNode;
  readonly run: () => void;
  readonly disabled?: boolean;
}

export const BarNav = ({
  label,
  actions,
  primary,
  onKeyDown,
  autoFocus = true,
  children,
}: {
  readonly label: string;
  readonly actions: readonly BarAction[];
  readonly primary: string;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly autoFocus?: boolean;
  readonly children?: ReactNode;
}) => (
  <BarStrip>
    <MenuList
      autoFocus={autoFocus}
      className="flex-nowrap gap-x-[2.4cqw]"
      defaultValue={primary}
      label={label}
      onKeyDown={onKeyDown}
      onSelect={(id) => actions.find((action) => action.id === id)?.run()}
      orientation="horizontal"
      size="sm"
    >
      {actions.map((action) => (
        <MenuItem
          className="data-selected:text-neon-yellow data-selected:outline-neon-yellow disabled:text-paper/35 px-[0.4em] !text-[1em] data-selected:outline-2"
          disabled={action.disabled}
          key={action.id}
          value={action.id}
        >
          {action.label}
        </MenuItem>
      ))}
    </MenuList>
    {children}
  </BarStrip>
);
