import {
  Card,
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import { SkewButton } from "@racer/ui/components/skew-button";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

interface ConfirmOption {
  readonly value: string;
  readonly label: string;
}

export const Confirm = ({
  label,
  warning,
  options,
  defaultValue,
  onSelect,
  onDismiss,
  children,
}: {
  readonly label: string;
  readonly warning?: ReactNode;
  readonly options: readonly ConfirmOption[];
  readonly defaultValue: string;
  readonly onSelect: (value: string) => void;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) => {
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
      aria-label={label}
      aria-modal
      className="bg-night/70 notice-in fixed inset-0 z-50 flex items-center justify-center"
      data-slot="confirm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDismiss();
        }
      }}
      role="alertdialog"
    >
      <Card>
        <PanelTitle>{label}</PanelTitle>
        <PanelRule />
        <PanelLine className="text-pretty">{children}</PanelLine>
        {warning !== undefined && (
          <PanelLine className="uppercase" tone="warn">
            {warning}
          </PanelLine>
        )}
        <div className="flex gap-3.5">
          {options.map((option) => (
            <SkewButton
              autoFocus={option.value === defaultValue}
              key={option.value}
              onClick={() => {
                onSelect(option.value);
              }}
              size="slim"
              title={option.label}
              tone={option.value === defaultValue ? "primary" : "plain"}
            />
          ))}
        </div>
      </Card>
    </div>
  );
};
