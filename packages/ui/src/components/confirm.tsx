import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Panel } from "@racer/ui/components/panel";
import { cn } from "@racer/ui/utils";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

interface ConfirmOption {
  readonly value: string;
  readonly label: string;
}

function Confirm({
  className,
  label,
  warning,
  options,
  defaultValue,
  onSelect,
  onDismiss,
  children,
  ...props
}: Omit<ComponentProps<"div">, "onSelect"> & {
  readonly label: string;
  readonly warning?: ReactNode;
  readonly options: readonly ConfirmOption[];
  readonly defaultValue: string;
  readonly onSelect: (value: string) => void;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) {
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
  return (
    <div
      data-slot="confirm"
      role="alertdialog"
      aria-modal
      aria-label={label}
      className={cn(
        "bg-ink/70 p-gutter notice-in absolute inset-0 z-50 grid place-items-center",
        className
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDismiss();
        }
      }}
      {...props}
    >
      <Panel className="flex w-[34rem] max-w-full flex-col gap-4" tone="raised">
        <p className="text-quote font-semibold text-pretty">{children}</p>
        {warning !== undefined && (
          <p className="text-label text-red font-semibold uppercase">
            {warning}
          </p>
        )}
        <MenuList
          autoFocus
          className="justify-between"
          defaultValue={defaultValue}
          label={label}
          onSelect={onSelect}
          orientation="horizontal"
          size="sm"
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </MenuList>
      </Panel>
    </div>
  );
}

export { Confirm };
export type { ConfirmOption };
