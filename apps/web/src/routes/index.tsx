import { createFileRoute } from "@tanstack/react-router";

import { GameShell } from "../components/game-shell.tsx";

export const Route = createFileRoute("/")({
  component: GameShell,
});
