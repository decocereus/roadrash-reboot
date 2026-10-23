import { roads } from "./fixtures.ts";
import { Section } from "./section.tsx";

const interfaceSwatches = [
  { name: "ink", swatch: "bg-ink" },
  { name: "panel", swatch: "bg-panel" },
  { name: "raised", swatch: "bg-raised" },
  { name: "line", swatch: "bg-line" },
  { name: "text", swatch: "bg-text" },
  { name: "muted", swatch: "bg-muted" },
  { name: "orange", swatch: "bg-orange" },
  { name: "yellow", swatch: "bg-yellow" },
  { name: "red", swatch: "bg-red" },
  { name: "green", swatch: "bg-green" },
  { name: "blue", swatch: "bg-blue" },
  { name: "cork", swatch: "bg-cork" },
  { name: "paper", swatch: "bg-paper" },
  { name: "polaroid", swatch: "bg-polaroid" },
  { name: "asphalt", swatch: "bg-asphalt" },
  { name: "road-worn", swatch: "bg-road-worn" },
  { name: "road-centre", swatch: "bg-road-centre" },
  { name: "road-edge", swatch: "bg-road-edge" },
  { name: "road-shoulder", swatch: "bg-road-shoulder" },
  { name: "road-verge", swatch: "bg-road-verge" },
] as const;

const Swatch = ({
  name,
  swatch,
}: {
  readonly name: string;
  readonly swatch: string;
}) => (
  <li className="flex items-center gap-3">
    <span className={`border-line size-8 shrink-0 border-2 ${swatch}`} />
    <span className="font-body text-label text-muted font-semibold uppercase">
      {name}
    </span>
  </li>
);

export const Tokens = () => (
  <Section title="Palette and type">
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {interfaceSwatches.map((entry) => (
        <Swatch key={entry.name} name={entry.name} swatch={entry.swatch} />
      ))}
    </ul>
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {roads.map((entry) => (
        <li key={entry.region}>
          <p className="font-body text-label text-muted font-semibold uppercase">
            {entry.regionName}
          </p>
          <div className="border-line mt-2 flex h-8 border-2">
            {entry.swatches.map((swatch) => (
              <span className={`flex-1 ${swatch}`} key={swatch} />
            ))}
          </div>
        </li>
      ))}
    </ul>
    <div className="mt-10 grid gap-8 lg:grid-cols-3">
      <div>
        <p className="font-display tracking-display text-heading font-extrabold uppercase">
          Saira 800
        </p>
        <p className="font-display tracking-display text-name font-bold uppercase">
          Saira Extra Condensed 700 · 0123456789
        </p>
      </div>
      <div>
        <p className="font-body text-body">
          Inter 400. Two lanes and a lot of nothing, then a right angle.
        </p>
        <p className="font-body text-quote mt-2 font-semibold">
          “Inter 600. Stay out of my lane.”
        </p>
        <p className="font-body text-label text-muted mt-2 font-semibold uppercase">
          Label · 13 px capitals
        </p>
      </div>
      <div>
        <p className="font-stencil tracking-display text-heading font-extrabold uppercase">
          Stencil 800
        </p>
      </div>
    </div>
  </Section>
);
