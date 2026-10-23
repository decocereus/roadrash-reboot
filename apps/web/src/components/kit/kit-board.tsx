import type { ReactNode } from "react";

import { Stage } from "../screens/clubhouse-stage.tsx";

export const KitBoard = ({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: ReactNode;
}) => (
  <section aria-label={title} className="mt-16">
    <h2 className="font-display text-paper text-name font-bold uppercase">
      {title}
    </h2>
    <p className="text-paper/60 mt-1 mb-4 max-w-3xl">{note}</p>
    <Stage className="bg-ink m-0 border border-white/10">{children}</Stage>
  </section>
);

const swatches = [
  { name: "ink", tone: "bg-ink border border-white/20", use: "Ground" },
  { name: "paper", tone: "bg-paper", use: "Sheets, tags, quiet text" },
  { name: "neon-yellow", tone: "bg-neon-yellow", use: "Selected, name tags" },
  { name: "neon-cyan", tone: "bg-neon-cyan", use: "Cyan note ink" },
  { name: "neon-magenta", tone: "bg-neon-magenta", use: "Bar signs" },
  { name: "neon-red", tone: "bg-neon-red", use: "Warnings" },
] as const;

const faces = [
  { face: "font-stencil", sample: "The Lowside", use: "Wordmark, stamps" },
  { face: "font-display", sample: "Season standings", use: "Everything set" },
  { face: "font-body", sample: "Left and right", use: "Long reading" },
] as const;

export const Palette = () => (
  <section aria-label="Palette and faces" className="mt-12">
    <h2 className="font-display text-paper text-name font-bold uppercase">
      Palette and faces
    </h2>
    <ul className="mt-4 grid grid-cols-3 gap-4 md:grid-cols-6">
      {swatches.map((swatch) => (
        <li key={swatch.name}>
          <div className={`h-20 ${swatch.tone}`} />
          <p className="font-display text-paper mt-2 font-bold uppercase">
            {swatch.name}
          </p>
          <p className="text-paper/60 text-label">{swatch.use}</p>
        </li>
      ))}
    </ul>
    <ul className="mt-8 grid gap-4 md:grid-cols-3">
      {faces.map((face) => (
        <li key={face.face}>
          <p
            className={`${face.face} text-paper text-heading leading-none font-black uppercase`}
          >
            {face.sample}
          </p>
          <p className="text-paper/60 text-label mt-2">
            {face.face} · {face.use}
          </p>
        </li>
      ))}
    </ul>
  </section>
);
