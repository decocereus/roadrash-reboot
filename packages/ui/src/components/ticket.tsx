import { formatMoney } from "@racer/ui/components/money";
import { Paper, PaperLine } from "@racer/ui/components/paper";
import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const Ticket = ({
  className,
  location,
  offence,
  fine,
  cashAfter,
  confiscated,
  warning,
  serial,
  tilt = -2,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly location: string;
  readonly offence: string;
  readonly fine: number;
  readonly cashAfter: number;
  readonly confiscated?: string | undefined;
  readonly warning?: string | undefined;
  readonly serial?: string | undefined;
  readonly tilt?: number;
}) => (
  <Paper
    data-slot="ticket"
    className={cn("w-80 max-w-full", className)}
    tilt={tilt}
    torn
    {...props}
  >
    <div className="border-blue flex items-end justify-between border-b-4 pb-1">
      <p className="font-display tracking-display text-blue text-4xl leading-none font-extrabold uppercase">
        Citation
      </p>
      {serial !== undefined && (
        <p className="numeric text-ink/60 text-xs font-semibold">
          No. {serial}
        </p>
      )}
    </div>
    <p className="text-label mt-3 font-semibold uppercase">{location}</p>
    <p className="mt-1 text-sm leading-snug font-semibold text-pretty uppercase">
      {offence}
    </p>
    <div className="mt-4 flex flex-col gap-2">
      <PaperLine label="Fine">{formatMoney(fine)}</PaperLine>
      <PaperLine
        className={cashAfter < 0 ? "text-red" : undefined}
        label={cashAfter < 0 ? "You owe" : "Cash after"}
      >
        {formatMoney(Math.abs(cashAfter))}
      </PaperLine>
    </div>
    {confiscated !== undefined && (
      <p className="border-ink/25 mt-3 border-t-2 border-dashed pt-2 text-xs font-semibold uppercase">
        {confiscated}
      </p>
    )}
    {warning !== undefined && (
      <p className="text-red mt-2 text-sm font-semibold uppercase">{warning}</p>
    )}
  </Paper>
);

export { Ticket };
