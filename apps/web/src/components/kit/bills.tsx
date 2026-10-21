import { Invoice } from "@racer/ui/components/invoice";
import { Ledger, LedgerRow, LedgerTotal } from "@racer/ui/components/ledger";
import { Panel } from "@racer/ui/components/panel";
import { Ticket } from "@racer/ui/components/ticket";

import { Section } from "./section.tsx";

export const Bills = () => (
  <Section title="Ticket, Invoice, Ledger">
    <div className="flex flex-wrap items-start gap-12">
      <Ticket
        cashAfter={1700}
        confiscated="Also confiscated: one club."
        fine={1500}
        location="Slag Row, km 3.1"
        offence="Racing on a public road. Also, falling off on one."
        serial="04417"
      />
      <Invoice
        amount={450}
        cashAfter={-250}
        detail="Level 2 · Featherweight"
        fullAmount={900}
        item="Repair, Halden Kite 500"
        note="Half, thanks to our sponsor"
        warning="This bill takes the Halden Kite 500."
      />
      <Panel className="w-96 max-w-full">
        <Ledger>
          <LedgerRow amount={1600} label="Prize, 2nd" />
          <LedgerRow amount={-900} label="Repairs" />
          <LedgerRow
            amount={0}
            label="Fines"
            note="Nobody caught you this time."
          />
          <LedgerTotal amount={3200} label="Cash" />
        </Ledger>
      </Panel>
    </div>
  </Section>
);
