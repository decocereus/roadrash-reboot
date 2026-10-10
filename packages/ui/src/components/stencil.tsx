import { cn } from "@racer/ui/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const stencilVariants = cva(
  "font-stencil tracking-display inline-block font-extrabold whitespace-nowrap uppercase select-none",
  {
    defaultVariants: {
      framed: false,
      size: "xl",
      tone: "red",
    },
    variants: {
      framed: {
        false: "",
        true: "border-[0.09em] border-current px-[0.28em] pt-[0.14em] pb-[0.08em] opacity-90",
      },
      size: {
        lg: "text-heading",
        md: "text-name",
        sm: "text-body leading-none",
        xl: "text-outcome",
      },
      tone: {
        green: "text-green",
        ink: "text-ink",
        police: "text-blue [text-shadow:0.045em_0.045em_0_var(--red)]",
        red: "text-red",
        text: "text-text",
        yellow: "text-yellow",
      },
    },
  }
);

function Stencil({
  className,
  size = "xl",
  tone = "red",
  framed = false,
  rotate = 0,
  style,
  ...props
}: ComponentProps<"span"> &
  VariantProps<typeof stencilVariants> & {
    readonly rotate?: number;
  }) {
  return (
    <span
      data-slot="stencil"
      className={cn(stencilVariants({ framed, size, tone }), className)}
      style={{ ...style, rotate: `${rotate}deg` }}
      {...props}
    />
  );
}

export { Stencil, stencilVariants };
