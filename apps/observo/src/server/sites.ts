import { z } from "zod";

// Add trusted public websites here. A new ID starts fresh history when check rules change.
const siteSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  }),
  navigation: z.array(z.string().min(1)).min(1),
  resultHeading: z.string().min(1),
  rowSelector: z.string().min(1),
  description: z.string().min(1),
});
export type Site = z.infer<typeof siteSchema>;
export const sites: readonly Site[] = siteSchema.array().parse([
  {
    id: "tischtennis-rendsburg",
    name: "TischtennisLive · Rendsburg-Eckernförde",
    url: "https://rendsburg-eckernfoerde.tischtennislive.de/",
    navigation: ["Spielbetrieb", "Kreisliga"],
    resultHeading: "Kreisliga Erwachsene",
    rowSelector: 'tr[id*="_Team"]',
    description:
      "Chromium opens the site, follows Spielbetrieb → Kreisliga, and verifies populated standings with team links and scores.",
  },
]);
if (new Set(sites.map((site) => site.id)).size !== sites.length)
  throw new Error("Duplicate Observo site ID");
