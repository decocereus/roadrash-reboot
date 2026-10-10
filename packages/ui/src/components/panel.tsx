import { cn } from "@racer/ui/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const panelVariants = cva(
  "text-text outline-yellow data-selected:bg-raised border-2 data-selected:outline-2 data-selected:outline-offset-2",
  {
    defaultVariants: {
      padding: "md",
      tone: "panel",
    },
    variants: {
      padding: {
        md: "p-panel",
        none: "",
        sm: "p-3",
      },
      tone: {
        panel: "bg-panel border-line",
        plate: "bg-panel/85 border-transparent backdrop-blur-sm",
        raised: "bg-raised border-line",
      },
    },
  }
);

function Panel({
  className,
  tone = "panel",
  padding = "md",
  edge,
  selected = false,
  style,
  ...props
}: ComponentProps<"div"> &
  VariantProps<typeof panelVariants> & {
    readonly edge?: string | undefined;
    readonly selected?: boolean;
  }) {
  return (
    <div
      data-slot="panel"
      data-selected={selected ? "true" : undefined}
      className={cn(
        panelVariants({ padding, tone }),
        edge !== undefined && "border-l-4",
        className
      )}
      style={edge === undefined ? style : { ...style, borderLeftColor: edge }}
      {...props}
    />
  );
}

export { Panel, panelVariants };
