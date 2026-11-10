import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const PANEL_CUT =
  "polygon(0 0, 100% 0, 100% calc(100% - 1.4rem), calc(100% - 1.4rem) 100%, 0 100%)";

const CARD_CUT =
  "polygon(0 0, calc(100% - 1.4rem) 0, 100% 1.4rem, 100% 100%, 1.4rem 100%, 0 calc(100% - 1.4rem))";

const Panel = ({ className, style, ...props }: ComponentProps<"section">) => (
  <section
    data-slot="panel"
    className={cn(
      "bg-night-raised border-neon-yellow font-display text-paper flex min-h-0 w-[25rem] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto border-2 border-t-0 px-5 pt-5 pb-6 tracking-wide uppercase",
      className
    )}
    style={{ clipPath: PANEL_CUT, ...style }}
    {...props}
  />
);

const Card = ({ className, style, ...props }: ComponentProps<"section">) => (
  <section
    data-slot="card"
    className={cn(
      "bg-night-raised/98 border-neon-yellow font-display text-paper flex w-[30rem] max-w-[calc(100vw-2rem)] flex-col gap-3.5 border-2 px-7 pt-6 pb-7 tracking-wide uppercase",
      className
    )}
    style={{ clipPath: CARD_CUT, ...style }}
    {...props}
  />
);

const titleFaces = {
  italic: "text-neon-yellow text-[2.9rem] font-extrabold italic",
  stencil: "font-stencil text-paper text-[2.6rem] font-extrabold",
} as const;

const PanelTitle = ({
  className,
  face = "italic",
  ...props
}: ComponentProps<"h2"> & { readonly face?: keyof typeof titleFaces }) => (
  <h2
    data-slot="panel-title"
    className={cn("m-0 truncate leading-none", titleFaces[face], className)}
    {...props}
  />
);

const PanelRule = ({ className }: { readonly className?: string }) => (
  <div
    aria-hidden
    data-slot="panel-rule"
    className={cn("bg-neon-magenta h-0.5 shrink-0", className)}
  />
);

const lineTones = {
  lit: "text-paper",
  quiet: "text-paper/70",
  warn: "text-neon-red",
} as const;

const PanelLine = ({
  className,
  tone = "lit",
  ...props
}: ComponentProps<"p"> & { readonly tone?: keyof typeof lineTones }) => (
  <p
    data-slot="panel-line"
    className={cn(
      "text-lg leading-snug font-bold tracking-normal normal-case",
      lineTones[tone],
      className
    )}
    {...props}
  />
);

const TextField = ({ className, ...props }: ComponentProps<"input">) => (
  <input
    data-slot="text-field"
    className={cn(
      "border-neon-cyan bg-ink text-paper caret-neon-cyan w-full border-2 px-3 py-2 text-[1.7rem] font-extrabold uppercase",
      className
    )}
    {...props}
  />
);

export { Card, Panel, PanelLine, PanelRule, PanelTitle, TextField };
