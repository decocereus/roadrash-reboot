import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

type SceneRegion =
  | "salt-coast"
  | "cinder-flats"
  | "kettle-woods"
  | "lowtown"
  | "stonepeak";

const RegionScene = ({
  className,
  region,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly region: SceneRegion;
}) => (
  <div
    aria-hidden
    data-slot="region-scene"
    data-region={region}
    className={cn(
      "relative size-full overflow-hidden bg-linear-to-b from-(--scene-zenith) to-(--scene-horizon) to-40%",
      className
    )}
    {...props}
  >
    <div className="absolute inset-x-0 top-[16%] h-[22%] bg-(--scene-far) [clip-path:var(--scene-skyline)]" />
    <div className="absolute inset-x-0 top-[36%] bottom-0 bg-(--scene-ground)" />
    <div className="absolute inset-x-0 top-[36%] bottom-0 bg-(--scene-verge) [clip-path:polygon(46%_0,54%_0,100%_100%,0_100%)]" />
    <div className="absolute inset-x-0 top-[36%] bottom-0 bg-(--scene-asphalt) [clip-path:polygon(48.4%_0,51.6%_0,84%_100%,16%_100%)]" />
    <div className="bg-road-edge absolute inset-x-0 top-[36%] bottom-0 [clip-path:polygon(48.6%_0,48.8%_0,22%_100%,19%_100%)]" />
    <div className="bg-road-edge absolute inset-x-0 top-[36%] bottom-0 [clip-path:polygon(51.2%_0,51.4%_0,81%_100%,78%_100%)]" />
    <div className="bg-road-centre absolute inset-x-0 top-[36%] bottom-0 [clip-path:polygon(49.9%_0,50.1%_0,51.6%_100%,48.4%_100%)]" />
  </div>
);

export { RegionScene };
export type { SceneRegion };
