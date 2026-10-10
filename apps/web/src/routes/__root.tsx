import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import stylesUrl from "../styles.css?url";

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    links: [{ href: stylesUrl, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { content: "dark", name: "color-scheme" },
      { content: "#0e0f12", name: "theme-color" },
      { title: "Rushline" },
      {
        content:
          "A motorcycle combat racer you play in the browser. Fast roads, oncoming traffic, hard crashes.",
        name: "description",
      },
    ],
  }),
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="dark" lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="px-8 py-16">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link className="text-primary mt-2 inline-block text-sm" to="/">
        Back to the road
      </Link>
    </div>
  );
}
