import { createFileRoute } from "@tanstack/react-router";

import { RaceScreen } from "../components/race-screen.tsx";

export const Route = createFileRoute("/")({
  component: RaceScreen,
});
