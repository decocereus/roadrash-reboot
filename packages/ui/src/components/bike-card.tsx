import { Bar } from "@racer/ui/components/bar";
import { Money } from "@racer/ui/components/money";
import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

interface BikeStat {
  readonly label: string;
  readonly value: number;
  readonly baseline?: number | undefined;
  readonly reading?: string | undefined;
}

const BikeStatBar = ({ stat }: { readonly stat: BikeStat }) => (
  <div data-slot="bike-stat" className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-body text-label text-muted font-semibold uppercase">
        {stat.label}
      </span>
      {stat.reading !== undefined && (
        <span className="font-display numeric tracking-display text-xl leading-none font-bold">
          {stat.reading}
        </span>
      )}
    </div>
    <Bar
      label={stat.label}
      mark={stat.baseline}
      max={1}
      tone="plain"
      value={stat.value}
    />
  </div>
);

const BikeCard = ({
  className,
  name,
  bikeClass,
  price,
  stats,
  pitch,
  note,
  locked,
  owned = false,
  ...props
}: Omit<ComponentProps<"article">, "children"> & {
  readonly name: string;
  readonly bikeClass: string;
  readonly price: number;
  readonly stats: readonly BikeStat[];
  readonly pitch?: string | undefined;
  readonly note?: string | undefined;
  readonly locked?: string | undefined;
  readonly owned?: boolean;
}) => (
  <article
    data-slot="bike-card"
    data-locked={locked === undefined ? undefined : ""}
    className={cn(
      "bg-panel border-line text-text p-panel flex w-80 max-w-full flex-col gap-4 border-2",
      className
    )}
    {...props}
  >
    <header className="flex items-start justify-between gap-4">
      <div>
        <h3 className="font-display tracking-display text-name font-bold uppercase">
          {name}
        </h3>
        <p className="font-body text-label text-muted font-semibold uppercase">
          {bikeClass}
        </p>
      </div>
      <div className="text-right">
        <Money
          amount={price}
          className="font-display tracking-display text-name font-bold"
        />
        {owned && (
          <p className="font-body text-label text-yellow font-semibold uppercase">
            ● Yours
          </p>
        )}
      </div>
    </header>
    <div className="flex flex-col gap-3">
      {stats.map((stat) => (
        <BikeStatBar key={stat.label} stat={stat} />
      ))}
    </div>
    {pitch !== undefined && (
      <blockquote className="font-body text-base leading-snug font-semibold text-pretty">
        “{pitch}”
      </blockquote>
    )}
    {locked !== undefined && (
      <p className="font-body text-label text-muted border-line border-t-2 pt-3 font-semibold uppercase">
        {locked}
      </p>
    )}
    {note !== undefined && (
      <p className="font-body text-muted text-xs">{note}</p>
    )}
  </article>
);

export { BikeCard };
export type { BikeStat };
