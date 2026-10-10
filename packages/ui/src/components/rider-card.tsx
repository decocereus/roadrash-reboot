import { Bar } from "@racer/ui/components/bar";
import { Money } from "@racer/ui/components/money";
import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

interface RiderColours {
  readonly bike: string;
  readonly jacket: string;
  readonly helmet: string;
}

function RiderPortrait({
  className,
  colours,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly colours: RiderColours;
}) {
  return (
    <div
      aria-hidden
      data-slot="rider-portrait"
      className={cn(
        "border-ink relative h-24 overflow-hidden border-b-2",
        className
      )}
      style={{ backgroundColor: colours.bike }}
      {...props}
    >
      <div className="absolute inset-0 bg-linear-to-t from-black/35 to-transparent" />
      <div
        className="border-ink absolute bottom-0 left-1/2 h-[42%] w-[46%] -translate-x-1/2 rounded-t-[40%] border-2 border-b-0"
        style={{ backgroundColor: colours.jacket }}
      />
      <div
        className="border-ink absolute bottom-[34%] left-1/2 aspect-square h-[46%] -translate-x-1/2 overflow-hidden rounded-full border-2"
        style={{ backgroundColor: colours.helmet }}
      >
        <div className="bg-ink absolute inset-x-0 top-[36%] h-[26%]" />
      </div>
    </div>
  );
}

function RiderTrait({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <>
      <span className="font-body text-label text-muted font-semibold uppercase">
        {label}
      </span>
      <Bar label={label} max={1} size="sm" tone="plain" value={value} />
    </>
  );
}

function RiderCard({
  className,
  name,
  home,
  colours,
  skill,
  aggression,
  line,
  tag,
  grid,
  you = false,
  ...props
}: Omit<ComponentProps<"article">, "children"> & {
  readonly name: string;
  readonly home: string;
  readonly colours: RiderColours;
  readonly skill: number;
  readonly aggression: number;
  readonly line?: string | undefined;
  readonly tag?: string | undefined;
  readonly grid?: number | undefined;
  readonly you?: boolean;
}) {
  return (
    <article
      data-slot="rider-card"
      data-you={you ? "" : undefined}
      className={cn(
        "bg-panel border-line text-text outline-yellow flex w-72 max-w-full flex-col border-2 data-you:outline-2 data-you:outline-offset-2",
        className
      )}
      {...props}
    >
      <RiderPortrait colours={colours} />
      <div className="flex flex-col gap-3 p-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display tracking-display text-name font-bold uppercase">
              {name}
            </h3>
            {grid !== undefined && (
              <span className="font-display numeric text-muted text-name font-bold">
                {grid}
              </span>
            )}
          </div>
          <p className="font-body text-label text-muted font-semibold uppercase">
            {home}
          </p>
          {tag !== undefined && (
            <p className="font-body text-label text-red mt-1 font-semibold uppercase">
              {tag}
            </p>
          )}
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <RiderTrait label="Skill" value={skill} />
          <RiderTrait label="Aggression" value={aggression} />
        </div>
        {line !== undefined && (
          <blockquote className="font-body border-line border-t-2 pt-3 text-base leading-snug font-semibold text-pretty">
            “{line}”
          </blockquote>
        )}
      </div>
    </article>
  );
}

function RiderRows({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      data-slot="rider-rows"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

function RiderRow({
  className,
  place,
  name,
  bike,
  result,
  prize,
  colour,
  note,
  you = false,
  ...props
}: Omit<ComponentProps<"li">, "children"> & {
  readonly place: number;
  readonly name: string;
  readonly bike: string;
  readonly result: ReactNode;
  readonly prize?: number | undefined;
  readonly colour: string;
  readonly note?: string | undefined;
  readonly you?: boolean;
}) {
  return (
    <li
      data-slot="rider-row"
      data-you={you ? "" : undefined}
      className={cn(
        "border-line text-text data-you:text-yellow grid grid-cols-[2ch_0.75rem_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(7ch,auto)_minmax(6ch,auto)] items-baseline gap-x-3 border-b-2 py-2",
        className
      )}
      {...props}
    >
      <span className="font-display numeric text-name leading-none font-extrabold">
        {place}
      </span>
      <span
        aria-hidden
        data-slot="rider-chip"
        className="ring-line size-3 self-center ring-2"
        style={{ backgroundColor: colour }}
      />
      <span className="font-display tracking-display text-name truncate leading-none font-bold uppercase">
        {name}
      </span>
      <span className="font-body text-muted truncate text-sm">{bike}</span>
      <span className="font-body numeric text-right text-sm font-semibold">
        {result}
      </span>
      {prize === undefined ? (
        <span />
      ) : (
        <Money amount={prize} className="font-body text-right text-sm" />
      )}
      {note !== undefined && (
        <span className="font-body text-muted col-span-4 col-start-3 pt-1 text-xs">
          ▸ {note}
        </span>
      )}
    </li>
  );
}

export { RiderCard, RiderPortrait, RiderRow, RiderRows };
export type { RiderColours };
