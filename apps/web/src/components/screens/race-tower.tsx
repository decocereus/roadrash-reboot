import { memo } from "react";

import type { TowerRow } from "../../game/hud.ts";

const ROW_EM = 1.3;

const markText = (row: TowerRow): string => {
  switch (row.mark) {
    case "lead": {
      return "Lead";
    }
    case "gap": {
      return `+${(row.tenths / 10).toFixed(1)}`;
    }
    case "blank": {
      return "";
    }
    case "wrecked": {
      return "Wrecked";
    }
    case "busted": {
      return "Busted";
    }
    default: {
      return row.mark satisfies never;
    }
  }
};

const out = (row: TowerRow): boolean =>
  row.mark === "wrecked" || row.mark === "busted";

const Row = ({ row }: { readonly row: TowerRow }) => (
  <li
    className={`absolute inset-x-0 top-0 flex items-center gap-[0.35em] pl-[0.35em] transition-transform duration-[220ms] ease-out motion-reduce:transition-none ${row.you ? "text-yellow border-yellow border-l-[0.2em]" : "text-text border-l-[0.2em] border-transparent"} ${out(row) ? "opacity-50" : ""}`}
    style={{
      height: `${ROW_EM}em`,
      transform: `translateY(${(row.place - 1) * ROW_EM}em)`,
    }}
  >
    <span className="w-[1.3em] shrink-0 text-right">{row.place}</span>
    <span
      aria-hidden
      className="outline-text/70 inline-block size-[0.6em] shrink-0 -skew-x-12 outline-1"
      style={{ background: row.chip }}
    />
    <span className="min-w-0 flex-1 truncate">{row.name}</span>
    {row.finished && (
      <span
        aria-label="Finished"
        className="outline-ink size-[0.6em] shrink-0 bg-[repeating-conic-gradient(var(--text)_0_25%,var(--ink)_0_50%)] bg-[length:0.3em_0.3em] outline-2"
        role="img"
      />
    )}
    <span className="w-[3.6em] shrink-0 text-right whitespace-nowrap">
      {markText(row)}
    </span>
  </li>
);

export const RaceTower = memo(
  ({ rows }: { readonly rows: readonly TowerRow[] }) => (
    <div className="font-display tracking-display numeric hud-ink bg-ink/55 absolute top-[3%] right-[2%] w-[clamp(10.5rem,30vmin,18rem)] p-[0.3em] text-[clamp(0.875rem,2.5vmin,1.5rem)] leading-none font-bold uppercase">
      <ol
        aria-label="Race order"
        className="relative"
        style={{ height: `${rows.length * ROW_EM}em` }}
      >
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ol>
    </div>
  )
);
