import { Money } from "@racer/ui/components/money";
import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

function Ledger({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      data-slot="ledger"
      className={cn("font-body text-text flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function LedgerRow({
  className,
  label,
  amount,
  note,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly label: ReactNode;
  readonly amount: number;
  readonly note?: ReactNode;
}) {
  return (
    <div
      data-slot="ledger-row"
      className={cn("flex items-baseline justify-between gap-6", className)}
      {...props}
    >
      <dt className="text-label font-semibold uppercase">
        {label}
        {note !== undefined && (
          <span className="text-muted block font-normal tracking-normal normal-case">
            {note}
          </span>
        )}
      </dt>
      <dd>
        <Money
          amount={amount}
          className="text-body font-semibold"
          kind="flow"
        />
      </dd>
    </div>
  );
}

function LedgerTotal({
  className,
  label,
  amount,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly label: ReactNode;
  readonly amount: number;
}) {
  return (
    <div
      data-slot="ledger-total"
      className={cn(
        "border-line mt-1 flex items-baseline justify-between gap-6 border-t-2 border-dashed pt-3",
        className
      )}
      {...props}
    >
      <dt className="font-display tracking-display text-name font-bold uppercase">
        {label}
      </dt>
      <dd>
        <Money
          amount={amount}
          className="font-display tracking-display text-name font-extrabold"
          kind="balance"
        />
      </dd>
    </div>
  );
}

export { Ledger, LedgerRow, LedgerTotal };
