import { createFileRoute, Link } from "@tanstack/react-router";

const records = [
  {
    kept: "Kept about 7 days in Cloudflare's logs.",
    title: "How each race ran",
    what: "The race ID, the road, the seed, connection times, where each rider connected from at city level, crashes, controls and frame times. With Race data on, it also holds the game version, your graphics card and quality level, and a timeline of your frame and network timing during the race. Riders are numbers. It holds no player ID, name or invite link.",
    why: "To find out why a race went badly. The room server writes most of this for every race, because it runs the race, so the switch below stops only the game version, graphics card, quality level and timeline.",
  },
  {
    kept: "Kept by PostHog, in the EU, under its retention rules.",
    title: "Where people stop playing",
    what: "A small list of events: the game opened and loaded, which race you picked, joining a room, copying an invite, a race starting and ending, and racing again. Each one carries your random ID, the race ID, your country, your graphics card, screen size and browser family.",
    why: "To see where the game loses people and what breaks on which machines. Events go through our server first, so PostHog never receives your IP address.",
  },
  {
    kept: "Every race during the closed test. Kept 7 days in Cloudflare's storage.",
    title: "Race tapes",
    what: "The controls each rider sent, the race's seed and versions, and checks that let us replay the race. Riders are numbers. It holds no player ID, name or invite link.",
    why: "To replay what a race went through when something goes wrong. The room server writes this too, so the switch below does not stop it.",
  },
] as const;

const never = [
  "Your name, including the name you type for a room",
  "Your email or any account token",
  "Chat",
  "Your IP address, in anything we keep",
  "Invite links",
  "Clicks or screen recordings",
] as const;

const PrivacyPage = () => (
  <main className="bg-ink text-paper min-h-screen px-6 py-12 font-sans sm:px-12">
    <div className="mx-auto max-w-3xl">
      <Link className="text-paper/70 underline underline-offset-4" to="/">
        Lowside
      </Link>
      <h1 className="mt-10 text-4xl font-semibold tracking-tight">
        What we record
      </h1>
      <p className="text-paper/70 mt-4 max-w-2xl">
        The first time you open Lowside, it makes a random ID and keeps it on
        your device. We can tell that the same ID came back. The ID has no link
        to your name, but it does tie your events together, so this data is not
        anonymous.
      </p>
      <ul className="mt-10 space-y-10">
        {records.map((record) => (
          <li className="border-paper/20 border-t pt-6" key={record.title}>
            <h2 className="text-xl font-medium">{record.title}</h2>
            <p className="mt-3">{record.what}</p>
            <p className="text-paper/70 mt-2">{record.why}</p>
            <p className="text-paper/70 mt-2 text-sm">{record.kept}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-12 text-xl font-medium">What we never record</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        {never.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2 className="mt-12 text-xl font-medium">Your choices</h2>
      <p className="mt-3">
        Settings has a Race data switch. Turn it off and the game stops sending
        events under your ID. Settings also shows your ID. During the closed
        test, send it to whoever invited you to have what is tied to it deleted.
        Clearing this site's data in your browser removes the ID from your
        device.
      </p>
    </div>
  </main>
);

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "What we record | Lowside" },
      {
        content: "What Lowside records about races, and how to switch it off.",
        name: "description",
      },
    ],
  }),
});
