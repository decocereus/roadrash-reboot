import { Heading } from "@racer/ui/components/heading";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { Asking } from "../components/kit/asking.tsx";
import { Bills } from "../components/kit/bills.tsx";
import { Board } from "../components/kit/board.tsx";
import { Garage } from "../components/kit/garage.tsx";
import { Hud } from "../components/kit/hud.tsx";
import { Meters } from "../components/kit/meters.tsx";
import { Notices } from "../components/kit/notices.tsx";
import { Riders } from "../components/kit/riders.tsx";
import { ScreenDemo } from "../components/kit/screen-demo.tsx";
import { Tokens } from "../components/kit/tokens.tsx";
import { Words } from "../components/kit/words.tsx";

const KitPage = () => (
  <div className="bg-ink text-text font-body text-body px-gutter min-h-screen py-10">
    <Heading as="h1">UI kit</Heading>
    <p className="text-muted mt-2 max-w-2xl">
      Every piece the career screens are built from, once, with sample data.
      This page only exists in development.
    </p>
    <div className="mt-10">
      <Tokens />
      <ScreenDemo />
      <Words />
      <Meters />
      <Board />
      <Bills />
      <Riders />
      <Garage />
      <Asking />
      <Hud />
      <Notices />
    </div>
  </div>
);

export const Route = createFileRoute("/kit")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: KitPage,
  head: () => ({
    meta: [
      { title: "Rushline UI kit" },
      { content: "noindex", name: "robots" },
    ],
  }),
});
