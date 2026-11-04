export const lobbyPoses = ["arms", "chat", "phone"] as const;
export type LobbyPose = (typeof lobbyPoses)[number];

export const lobbyPlaces = ["foot", "stool", "bike"] as const;
export type LobbyPlaceKind = (typeof lobbyPlaces)[number];

export const lobbyActs = ["greet", "shove"] as const;
export type LobbyAct = (typeof lobbyActs)[number];

export interface LobbyWalk {
  readonly heading: number;
  readonly lean: number;
  readonly pace: number;
  readonly place: LobbyPlaceKind;
  readonly pose: LobbyPose | null;
  readonly x: number;
  readonly z: number;
}
