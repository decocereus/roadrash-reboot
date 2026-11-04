import { createFileRoute, notFound } from "@tanstack/react-router";

import { BarStage } from "../components/bar-stage.tsx";

export const Route = createFileRoute("/bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: () => <BarStage seat={null} />,
  head: () => ({
    meta: [{ title: "The Lowside" }, { content: "noindex", name: "robots" }],
  }),
  ssr: false,
});
