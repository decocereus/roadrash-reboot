import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

type MoneyKind = "flow" | "balance" | "plain";

const formatMoney = (amount: number, kind: MoneyKind = "plain"): string => {
  const dollars = `$${Math.abs(amount).toLocaleString("en-US")}`;
  if (amount < 0) {
    return `− ${dollars}`;
  }
  return kind === "flow" && amount > 0 ? `+ ${dollars}` : dollars;
};

const moneyTone = (amount: number, kind: MoneyKind): string => {
  if (kind === "plain") {
    return "";
  }
  if (amount < 0) {
    return "text-red";
  }
  if (kind === "balance") {
    return "text-text";
  }
  return amount > 0 ? "text-green" : "text-muted";
};

const directionOf = (amount: number): "in" | "none" | "out" => {
  if (amount < 0) {
    return "out";
  }
  return amount > 0 ? "in" : "none";
};

const Money = ({
  className,
  amount,
  kind = "plain",
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  readonly amount: number;
  readonly kind?: MoneyKind;
}) => (
  <span
    data-slot="money"
    data-direction={directionOf(amount)}
    className={cn(
      "numeric whitespace-nowrap",
      moneyTone(amount, kind),
      className
    )}
    {...props}
  >
    {formatMoney(amount, kind)}
  </span>
);

export { Money, formatMoney };
