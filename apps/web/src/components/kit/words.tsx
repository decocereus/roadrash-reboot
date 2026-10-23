import { Bar } from "@racer/ui/components/bar";
import { Heading } from "@racer/ui/components/heading";
import { Panel } from "@racer/ui/components/panel";
import { Stencil } from "@racer/ui/components/stencil";

import { moose } from "./fixtures.ts";
import { Section } from "./section.tsx";

export const Words = () => (
  <Section title="Heading, Stencil, Panel">
    <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
      <Heading size="xl">Garage</Heading>
      <Heading>Route board</Heading>
      <Heading size="md" tone="text">
        Moose Kowalczyk
      </Heading>
      <Heading size="sm" tone="yellow">
        Featherweight
      </Heading>
    </div>
    <div className="mt-10 flex flex-wrap items-center gap-x-14 gap-y-10">
      <Stencil rotate={-4}>Wrecked</Stencil>
      <Stencil rotate={3} tone="police">
        Busted
      </Stencil>
      <Stencil framed rotate={-8} size="lg" tone="yellow">
        Qualified
      </Stencil>
      <Stencil size="lg" tone="text">
        Winner
      </Stencil>
      <Stencil framed rotate={6} size="md" tone="green">
        Finished
      </Stencil>
    </div>
    <div className="mt-10 grid gap-6 md:grid-cols-4">
      <Panel>Panel</Panel>
      <Panel tone="raised">Raised</Panel>
      <Panel selected>Selected</Panel>
      <Panel edge={moose.bike} padding="sm" tone="plate">
        <Heading as="p" size="sm" tone="text">
          Moose
        </Heading>
        <Bar className="mt-2" label="Moose stamina" value={62} />
      </Panel>
    </div>
  </Section>
);
