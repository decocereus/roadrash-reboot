import { STARTING_BIKE } from "@racer/career/tables";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { savedBarCamera } from "../bar-view.ts";
import { BarStage } from "../components/bar-stage.tsx";

const BareBar = () => (
  <main className="bg-ink fixed inset-0">
    <BarStage
      camera={savedBarCamera()}
      doorOpen={false}
      garageOpen={false}
      onWalkUp={null}
      seat={null}
      standBike={STARTING_BIKE}
    />
  </main>
);

export const Route = createFileRoute("/bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: BareBar,
  head: () => ({
    meta: [{ title: "The Lowside" }, { content: "noindex", name: "robots" }],
  }),
  ssr: false,
});
