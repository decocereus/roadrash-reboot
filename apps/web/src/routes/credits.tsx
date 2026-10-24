import { madridSources } from "@racer/track/madrid-sources";
import { createFileRoute, Link } from "@tanstack/react-router";

const CreditsPage = () => (
  <main className="bg-ink text-paper min-h-screen px-6 py-12 font-sans sm:px-12">
    <div className="mx-auto max-w-3xl">
      <Link className="text-paper/70 underline underline-offset-4" to="/">
        Lowside
      </Link>
      <h1 className="mt-10 text-4xl font-semibold tracking-tight">
        Data credits
      </h1>
      <p className="text-paper/70 mt-4 max-w-2xl">
        The Madrid corridor uses the open datasets below. Their creators retain
        their rights. The data has been adapted, and none of these organisations
        endorses Lowside.
      </p>
      <ul className="mt-10 space-y-10">
        {madridSources.map((source) => (
          <li className="border-paper/20 border-t pt-6" key={source.id}>
            <h2 className="text-xl font-medium">
              <a className="underline underline-offset-4" href={source.url}>
                {source.name}
              </a>
            </h2>
            <p className="mt-3">{source.attribution}</p>
            <p className="text-paper/70 mt-2 text-sm">{source.date}</p>
            <p className="text-paper/70 mt-2">{source.changes}</p>
            <a
              className="mt-3 inline-block underline underline-offset-4"
              href={source.licenceUrl}
            >
              {source.licence}
              {source.id === "microsoft-buildings"
                ? " · full licence text"
                : ""}
            </a>
          </li>
        ))}
      </ul>
    </div>
  </main>
);

export const Route = createFileRoute("/credits")({
  component: CreditsPage,
  head: () => ({
    meta: [
      { title: "Data credits · Lowside" },
      {
        content: "Sources and licences for Lowside's Madrid corridor.",
        name: "description",
      },
    ],
  }),
});
