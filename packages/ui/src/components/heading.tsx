import { cn } from "@racer/ui/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const headingVariants = cva(
  "font-display tracking-display text-balance uppercase",
  {
    defaultVariants: {
      size: "lg",
      tone: "orange",
    },
    variants: {
      size: {
        lg: "text-heading font-extrabold",
        md: "text-name font-bold",
        sm: "text-body leading-none font-bold",
        xl: "text-hud font-extrabold",
      },
      tone: {
        ink: "text-ink",
        muted: "text-muted",
        orange: "text-orange",
        red: "text-red",
        text: "text-text",
        yellow: "text-yellow",
      },
    },
  }
);

const Heading = ({
  as: Tag = "h2",
  className,
  size = "lg",
  tone = "orange",
  ...props
}: ComponentProps<"h2"> &
  VariantProps<typeof headingVariants> & {
    readonly as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  }) => (
  <Tag
    data-slot="heading"
    className={cn(headingVariants({ size, tone }), className)}
    {...props}
  />
);

export { Heading };
