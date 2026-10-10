import { Pin } from "@racer/ui/components/paper";
import type { PinColour } from "@racer/ui/components/paper";
import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

const widths = {
  lg: "w-96",
  md: "w-60",
  sm: "w-36",
  xs: "w-28",
} as const;

const titles = {
  lg: "text-2xl",
  md: "text-2xl",
  sm: "text-lg",
  xs: "text-base",
} as const;

function Postcard({
  className,
  title,
  caption,
  scene,
  stamp,
  tilt = 0,
  size = "md",
  pin = "red",
  selected = false,
  style,
  ...props
}: Omit<ComponentProps<"figure">, "title" | "children"> & {
  readonly title: ReactNode;
  readonly caption?: ReactNode;
  readonly scene: ReactNode;
  readonly stamp?: ReactNode;
  readonly tilt?: number;
  readonly size?: keyof typeof widths;
  readonly pin?: PinColour;
  readonly selected?: boolean;
}) {
  return (
    <figure
      data-slot="postcard"
      data-selected={selected ? "true" : undefined}
      className={cn(
        "bg-polaroid text-ink outline-yellow ease-out-quint relative shrink-0 p-2 shadow-[0_6px_14px_rgb(0_0_0/45%)] transition-[rotate,scale,translate,box-shadow] duration-200 data-selected:z-10 data-selected:-translate-y-2 data-selected:scale-106 data-selected:shadow-[0_18px_30px_rgb(0_0_0/55%)] data-selected:outline-3 data-selected:outline-offset-3",
        widths[size],
        className
      )}
      style={{ ...style, rotate: selected ? "0deg" : `${tilt}deg` }}
      {...props}
    >
      <Pin colour={pin} />
      <div
        data-slot="postcard-scene"
        className="bg-ink relative aspect-3/2 overflow-hidden"
      >
        {scene}
      </div>
      {stamp !== undefined && (
        <div
          data-slot="postcard-stamp"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          {stamp}
        </div>
      )}
      <figcaption className="px-1 pt-2 pb-1 text-center">
        <p
          className={cn(
            "font-display tracking-display leading-none font-extrabold uppercase",
            titles[size]
          )}
        >
          {title}
        </p>
        {caption !== undefined && (
          <p className="font-body text-ink/70 mt-1 text-xs font-semibold">
            {caption}
          </p>
        )}
      </figcaption>
    </figure>
  );
}

export { Postcard };
