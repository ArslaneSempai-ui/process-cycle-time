/**
 * The tail, and what puts cases in it.
 *
 * "We average six days" is the sentence a process review opens with, and it describes
 * almost no case in the log. Half are done in under three; one in ten takes more than
 * fifteen. A mean over a distribution that skewed is a number about nothing — it is not
 * a typical case and it is not a bad one, and any target set on it is met by cases that
 * never had a problem.
 *
 * What separates the two populations is not the size of the file or the diligence of the
 * analyst. It is **whether the case went round the loop**. A case that never came back is
 * a different process from one that came back twice, and averaging them produces a number
 * that belongs to neither.
 *
 * That is the finding, and it is the one that survives being taken to another company:
 * before asking how to make a step faster, ask how many cases had to do it twice.
 */

import { generate, days, byCase } from "./events.ts";
import { perCase } from "./time.ts";
import { ASSUMPTIONS } from "./assumptions.ts";
import { wilson } from "./interval.ts";
import { isMain } from "./cli.ts";
import type { Assumptions } from "./assumptions.ts";
import type { Event } from "./events.ts";
import type { CaseTime } from "./time.ts";

export type Cohort = {
  passes: number;
  label: string;
  cases: number;
  share: number;
  meanLeadDays: number;
  medianLeadDays: number;
  meanTouchHours: number;
  /** How much longer than a clean case, as a multiple. */
  timesLonger: number;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function cohorts(times: CaseTime[] = perCase()): Cohort[] {
  const buckets = new Map<number, CaseTime[]>();
  for (const t of times) {
    const k = Math.min(t.reworkPasses, 2);
    buckets.set(k, [...(buckets.get(k) ?? []), t]);
  }

  const clean = buckets.get(0) ?? [];
  const cleanMean = clean.length ? clean.reduce((s, t) => s + t.leadMinutes, 0) / clean.length : 1;

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([passes, list]) => {
      const mean = list.reduce((s, t) => s + t.leadMinutes, 0) / list.length;
      return {
        passes,
        label: passes === 0 ? "no rework" : passes === 1 ? "came back once" : "came back twice or more",
        cases: list.length,
        share: list.length / times.length,
        meanLeadDays: days(mean),
        medianLeadDays: days(median(list.map((t) => t.leadMinutes))),
        meanTouchHours: list.reduce((s, t) => s + t.touchMinutes, 0) / list.length / 60,
        timesLonger: mean / cleanMean,
      };
    });
}

/**
 * What the rework is worth removing.
 *
 * Two costs, and they are not the same thing. The analyst hours are real money and small.
 * The elapsed days are not on anybody's budget and are the reason the process has a
 * reputation — which is what a review is usually convened about.
 *
 * Priced as "if these cases had gone through clean", which is an upper bound and is said
 * to be one. Some rework is a customer sending the wrong file, and no process change
 * prevents that.
 */
export type ReworkCost = {
  affectedCases: number;
  share: number;
  low: number;
  high: number;
  /** Extra analyst hours a year, across all rework. */
  extraHoursPerYear: number;
  extraCostPerYear: number;
  /** Working days each affected case spends in the loop, on average. */
  extraDaysPerCase: number;
  /** What removing all of it would do to the headline average. */
  meanDaysBefore: number;
  meanDaysIfNoRework: number;
};

export function costOfRework(
  times: CaseTime[] = perCase(),
  a: Assumptions = ASSUMPTIONS,
): ReworkCost {
  const c = cohorts(times);
  const clean = c.find((x) => x.passes === 0)!;
  const affected = times.filter((t) => t.reworkPasses > 0);
  const [low, high] = wilson(affected.length, times.length);

  const extraMinutes = affected.reduce((s, t) => s + (t.touchMinutes - clean.meanTouchHours * 60), 0);
  const perYear = (x: number) => (x * a.casesPerYear) / times.length;

  const meanAll = times.reduce((s, t) => s + t.leadMinutes, 0) / times.length;

  return {
    affectedCases: affected.length,
    share: affected.length / times.length,
    low, high,
    extraHoursPerYear: perYear(extraMinutes) / 60,
    extraCostPerYear: (perYear(extraMinutes) / 60) * a.loadedHourlyCost,
    extraDaysPerCase: affected.length
      ? days(affected.reduce((s, t) => s + t.leadMinutes, 0) / affected.length - clean.meanLeadDays * 480)
      : 0,
    meanDaysBefore: days(meanAll),
    meanDaysIfNoRework: clean.meanLeadDays,
  };
}

if (isMain(import.meta)) {
  const times = perCase(generate());
  const c = cohorts(times);
  const cost = costOfRework(times);
  const pc = (x: number) => (x * 100).toFixed(1) + " %";
  const money = (x: number) => "$" + Math.round(x).toLocaleString("en-GB");

  console.log("\nThe same process, split by whether the case came back\n");
  console.log("                          cases    share    mean days   median   worked    vs clean");
  console.log("─".repeat(88));
  for (const x of c) {
    console.log(
      `${x.label.padEnd(24)}${String(x.cases).padStart(7)}${pc(x.share).padStart(9)}` +
      `${x.meanLeadDays.toFixed(1).padStart(13)}${x.medianLeadDays.toFixed(1).padStart(9)}` +
      `${(x.meanTouchHours.toFixed(1) + " h").padStart(9)}${(x.timesLonger.toFixed(1) + "×").padStart(12)}`,
    );
  }

  console.log(
    `\nThe headline average is ${cost.meanDaysBefore.toFixed(1)} days. No cohort above is at ` +
    `${cost.meanDaysBefore.toFixed(1)} days.\nIt is an average of two populations that do not ` +
    `overlap, and a target set on it is met\nby the cases that never had a problem.`,
  );

  console.log(
    `\n\n${cost.affectedCases.toLocaleString("en-GB")} cases went round the loop — ` +
    `${pc(cost.share)} [${pc(cost.low)} – ${pc(cost.high)}].\n` +
    `Each one spends an extra ${cost.extraDaysPerCase.toFixed(1)} working days there.\n` +
    `\nRemoving all of it: ${cost.meanDaysBefore.toFixed(1)} days → ${cost.meanDaysIfNoRework.toFixed(1)} days end to end, ` +
    `and ${money(cost.extraCostPerYear)} a year of analyst time.\n` +
    `\nThat is an upper bound and is meant as one: some rework is a customer sending the wrong\n` +
    `file, and no process change prevents that. What the figure is for is comparing against\n` +
    `the cost of the change — which is the comparison nobody makes before starting.\n`,
  );
}
