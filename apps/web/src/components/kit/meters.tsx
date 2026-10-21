import { Bar, Pips } from "@racer/ui/components/bar";
import { Money } from "@racer/ui/components/money";
import { Stat } from "@racer/ui/components/stat";

import { Section } from "./section.tsx";

export const Meters = () => (
  <Section title="Bar, Stat, Money">
    <div className="grid gap-10 md:grid-cols-3">
      <div className="flex flex-col gap-4">
        <Bar label="Stamina, full" value={88} />
        <Bar label="Stamina, under 50" value={41} />
        <Bar label="Stamina, under 25" value={17} />
        <Bar align="right" label="Rival stamina" value={70} />
      </div>
      <div className="flex flex-col gap-4">
        <Bar label="Bike, sound" size="sm" tone="condition" value={92} />
        <Bar label="Bike, worn" size="sm" tone="condition" value={38} />
        <Bar label="Bike, failing" size="sm" tone="condition" value={12} />
        <Bar label="Top speed" mark={0.58} max={1} tone="plain" value={0.66} />
        <Pips label="Club hits left" max={8} value={5} />
        <Pips label="Pipe hits left" max={3} value={0} />
      </div>
      <div className="flex flex-col gap-4">
        <Stat label="Speed" size="lg" value="187" />
        <Stat label="Top speed" layout="row" size="sm" value="190 km/h" />
        <div className="font-body flex flex-wrap gap-x-6 gap-y-1 font-semibold">
          <Money amount={1600} kind="flow" />
          <Money amount={-900} kind="flow" />
          <Money amount={0} kind="flow" />
          <Money amount={3200} kind="balance" />
          <Money amount={-750} kind="balance" />
          <Money amount={5000} />
        </div>
      </div>
    </div>
  </Section>
);
