import { Heading } from "@racer/ui/components/heading";
import type { ReactNode } from "react";

export const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="border-line border-t-2 py-10">
    <Heading as="h2" className="mb-6" size="md" tone="muted">
      {title}
    </Heading>
    {children}
  </section>
);
