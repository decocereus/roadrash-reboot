import { formatMoney } from "@racer/ui/components/money";
import { Paper, PaperLine } from "@racer/ui/components/paper";
import type { PinColour } from "@racer/ui/components/paper";
import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

function Invoice({
  className,
  item,
  detail,
  amount,
  fullAmount,
  cashAfter,
  warning,
  note,
  tilt = 1.5,
  pin = "yellow",
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly item: string;
  readonly detail: string;
  readonly amount: number;
  readonly fullAmount?: number | undefined;
  readonly cashAfter: number;
  readonly warning?: string | undefined;
  readonly note?: string | undefined;
  readonly tilt?: number;
  readonly pin?: PinColour;
}) {
  return (
    <Paper
      data-slot="invoice"
      className={cn("w-80 max-w-full", className)}
      pin={pin}
      tilt={tilt}
      {...props}
    >
      <p className="font-display tracking-display border-ink border-b-2 pb-1 text-3xl leading-none font-extrabold uppercase">
        Invoice
      </p>
      <p className="mt-3 text-sm font-semibold uppercase">{item}</p>
      <p className="text-label text-ink/70 font-semibold uppercase">{detail}</p>
      <p className="font-display numeric tracking-display mt-3 flex items-baseline gap-3 text-6xl leading-none font-extrabold">
        {formatMoney(amount)}
        {fullAmount !== undefined && fullAmount !== amount && (
          <s className="text-ink/50 text-2xl font-bold">
            {formatMoney(fullAmount)}
          </s>
        )}
      </p>
      {note !== undefined && (
        <p className="mt-1 text-xs font-semibold uppercase">{note}</p>
      )}
      <PaperLine
        className={cn(
          "border-ink/25 mt-4 border-t-2 border-dashed pt-3",
          cashAfter < 0 && "text-red"
        )}
        label={cashAfter < 0 ? "You owe" : "Cash after"}
      >
        {formatMoney(Math.abs(cashAfter))}
      </PaperLine>
      {warning !== undefined && (
        <p className="text-red mt-2 text-sm font-semibold uppercase">
          {warning}
        </p>
      )}
    </Paper>
  );
}

export { Invoice };
