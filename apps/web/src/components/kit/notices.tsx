import { AdSlot } from "@racer/ui/components/ad-slot";
import { Notice, Toast } from "@racer/ui/components/notice";

import { Section } from "./section.tsx";

export const Notices = () => (
  <Section title="Notice, Toast, AdSlot">
    <div className="bg-asphalt border-line relative h-56 border-2">
      <Notice>Got the club</Notice>
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <Toast tone="green">Dee joined.</Toast>
        <Toast tone="red">
          Lyle lost connection. The bike rides on autopilot.
        </Toast>
      </div>
    </div>
    <div className="mt-10 flex flex-wrap items-start gap-8">
      <AdSlot />
      <AdSlot format="rectangle" />
    </div>
  </Section>
);
