import { Section } from "./section.tsx";

export const Hud = () => (
  <Section title="HUD utilities">
    <div className="border-line bg-muted relative flex h-40 items-center justify-around border-2">
      <p className="font-display tracking-display hud-ink text-hud font-extrabold uppercase">
        3rd <span className="text-name">/ 8</span>
      </p>
      <p className="font-display tracking-display flash-hold hud-ink text-hud font-extrabold uppercase">
        2nd
      </p>
      <p className="font-display tracking-display cop-blink text-name bg-ink/85 px-4 py-1 font-extrabold uppercase">
        ▲ Cop 40 m ▲
      </p>
    </div>
    <p className="text-muted mt-3 max-w-2xl text-sm">
      hud-ink outlines text over the road. flash-hold shows yellow for half a
      second when it mounts. cop-blink is the one blinking element.
    </p>
  </Section>
);
