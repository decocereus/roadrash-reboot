export const roadIds = ["breakwater-run", "slag-row", "ridge-road"] as const;

export type RoadId = (typeof roadIds)[number];
