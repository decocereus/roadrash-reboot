import { cn } from "@racer/ui/utils";
import type { ComponentProps, CSSProperties } from "react";

const STAGE_WIDTH = 1672;
const STAGE_HEIGHT = 941;
const PERCENT = 100;

export interface StageBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const place = ({ x, y, w, h }: StageBox): CSSProperties => ({
  height: `${(h / STAGE_HEIGHT) * PERCENT}%`,
  left: `${(x / STAGE_WIDTH) * PERCENT}%`,
  position: "absolute",
  top: `${(y / STAGE_HEIGHT) * PERCENT}%`,
  width: `${(w / STAGE_WIDTH) * PERCENT}%`,
});

export const stagePx = (px: number): string =>
  `${((px / STAGE_WIDTH) * PERCENT).toFixed(3)}cqw`;

export const Stage = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "[container-type:inline-size] relative m-auto aspect-[1672/941] w-[min(100vw,calc(100dvh*1672/941))] overflow-hidden",
      className
    )}
    {...props}
  />
);

export const Plate = ({
  src,
  box,
  className,
  style,
}: {
  readonly src: string;
  readonly box: StageBox;
  readonly className?: string | undefined;
  readonly style?: CSSProperties;
}) => (
  <img
    alt=""
    className={cn("pointer-events-none object-contain select-none", className)}
    decoding="async"
    draggable={false}
    src={src}
    style={{ ...place(box), ...style }}
  />
);
