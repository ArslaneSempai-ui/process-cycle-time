/**
 * Which inputs decide what to do, and which only change the size of the number.
 *
 * The measurement here is unusually robust — an event log is an event log, and the mean,
 * the median and the rework share come straight out of it. What is not robust is the
 * decision built on top, and the decision rests on three figures nobody can hand you.
 *
 * The one worth watching is `costPerDayOfDelay`. Set it to zero — which is what a process
 * business case does when nobody can name it — and the whole exercise is worth a fraction
 * of what it is worth at any plausible non-zero value. An unpriced cost is not a cost of
 * zero, and treating it as one is how process work loses to whatever has a number attached.
 */

import { perCase } from "./time.ts";
import { costOfRework } from "./rework.ts";
import { ASSUMPTIONS, BOUNDS } from "./assumptions.ts";
import { generate } from "./events.ts";
import { isMain } from "./cli.ts";
import type { Assumptions } from "./assumptions.ts";

const times = perCase(generate());

/** Total annual value of removing all rework, under a given set of assumptions. */
export function totalValue(a: Assumptions): number {
  const c = costOfRework(times, a);
  const daysSaved = (c.meanDaysBefore - c.meanDaysIfNoRework) * a.casesPerYear;
  return c.extraCostPerYear + daysSaved * a.costPerDayOfDelay;
}

export type Band = {
  name: keyof Assumptions;
  current: number;
  low: number;
  high: number;
  /** Value at each end of the plausible range. */
  atLow: number;
  atHigh: number;
  /** How many times bigger the answer gets across the range. */
  spread: number;
};

export function bands(): Band[] {
  return (Object.keys(BOUNDS) as (keyof Assumptions)[]).map((name) => {
    const [low, high] = BOUNDS[name];
    const atLow = totalValue({ ...ASSUMPTIONS, [name]: low });
    const atHigh = totalValue({ ...ASSUMPTIONS, [name]: high });
    return {
      name, current: ASSUMPTIONS[name], low, high, atLow, atHigh,
      spread: atLow === 0 ? Infinity : atHigh / atLow,
    };
  });
}

if (isMain(import.meta)) {
  const money = (x: number) => "$" + Math.round(x).toLocaleString("en-GB");
  const base = totalValue(ASSUMPTIONS);

  console.log(`\nRemoving all rework is worth ${money(base)} a year at the assumptions in use.\n`);
  console.log("input                    in use        at the low end      at the high end     spread");
  console.log("─".repeat(90));

  for (const b of bands()) {
    console.log(
      `${b.name.padEnd(22)}${b.current.toLocaleString("en-GB").padStart(10)}` +
      `${(money(b.atLow) + " @ " + b.low.toLocaleString("en-GB")).padStart(22)}` +
      `${(money(b.atHigh) + " @ " + b.high.toLocaleString("en-GB")).padStart(22)}` +
      `${(Number.isFinite(b.spread) ? b.spread.toFixed(1) + "×" : "∞").padStart(10)}`,
    );
  }

  const zero = totalValue({ ...ASSUMPTIONS, costPerDayOfDelay: 0 });
  console.log(
    `\nWith a day of delay priced at zero — which is what happens when nobody can name it —` +
    `\nthe same work is worth ${money(zero)} rather than ${money(base)}. ` +
    `That is a factor of ${(base / zero).toFixed(1)},` +
    `\nand it is the difference between a project that gets funded and one that does not.` +
    `\n\nAn unpriced cost is not a cost of zero. Treating it as one is how process work loses` +
    `\nto whatever happens to have a number attached to it.\n`,
  );
}
