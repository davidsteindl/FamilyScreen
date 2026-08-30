import { local } from "./calendar";

// No commas: the 5x7 font has none, and a blank gap reads worse than none at all.
const QUOTES = [
  "Jeder Tag ist ein neuer Anfang",
  "Zuhause ist wo die Familie ist",
  "Geteilte Freude ist doppelte Freude",
  "Kleine Schritte sind auch Schritte",
  "Heute ist ein guter Tag dafür",
  "Zeit ist das schönste Geschenk",
  "Wer lacht lebt länger",
  "Ein guter Tag beginnt mit einem Gruß",
];

/** Same saying all day, a new one at midnight. */
export function quoteOfTheDay(date: Date) {
  return QUOTES[local(date).ordinal % QUOTES.length];
}
