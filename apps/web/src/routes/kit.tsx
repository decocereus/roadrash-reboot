import { createFileRoute, notFound } from "@tanstack/react-router";

import { Palette } from "../components/kit/kit-board.tsx";
import {
  ChromeBoard,
  ConfirmBoard,
  WallBoard,
} from "../components/kit/paper-boards.tsx";
import { RaceBoard } from "../components/kit/race-board.tsx";

const KitPage = () => (
  <div className="bg-ink text-paper font-body text-body px-gutter min-h-screen py-10">
    <h1 className="font-stencil text-heading leading-none font-black uppercase">
      UI kit
    </h1>
    <p className="text-paper/60 mt-2 max-w-2xl">
      The pieces the game ships, laid out on the same 1672 × 941 stage the
      screens use. This page only exists in development.
    </p>
    <Palette />
    <ChromeBoard />
    <WallBoard />
    <ConfirmBoard />
    <RaceBoard />
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
  ssr: false,
});
