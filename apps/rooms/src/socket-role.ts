export const SOCKET_ROLES = ["lobby", "seated", "reporting"] as const;

export type SocketRoleKind = (typeof SOCKET_ROLES)[number];

export type SocketRole<Run, Seat> =
  | { readonly kind: "lobby" }
  | { readonly kind: "seated"; readonly run: Run; readonly seat: Seat }
  | { readonly kind: "reporting"; readonly seat: Seat };

export type SocketEvent<Run, Seat> =
  | {
      readonly kind: "raceBuilt" | "rejoined";
      readonly run: Run;
      readonly seat: Seat;
    }
  | { readonly kind: "graceOver" | "raceOver" };

export const IN_THE_LOBBY = { kind: "lobby" } as const;

export const roleAfter = <Run, Seat>(
  role: SocketRole<Run, Seat>,
  event: SocketEvent<Run, Seat>
): SocketRole<Run, Seat> | null => {
  switch (event.kind) {
    case "raceBuilt":
    case "rejoined": {
      return role.kind === "lobby"
        ? { kind: "seated", run: event.run, seat: event.seat }
        : null;
    }
    case "raceOver": {
      return role.kind === "seated"
        ? { kind: "reporting", seat: role.seat }
        : null;
    }
    case "graceOver": {
      return role.kind === "reporting" ? IN_THE_LOBBY : null;
    }
    default: {
      return event satisfies never;
    }
  }
};
