import type { TrackPlan } from "@racer/track/track";
import { breakwaterRun } from "@racer/track/tracks/breakwater-run";

const variantPlan: TrackPlan = { ...breakwaterRun, name: "Variant Run" };

export default variantPlan;
