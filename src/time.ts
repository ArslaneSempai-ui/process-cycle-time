/**
 * Where the eleven days went.
 *
 * A process report gives you an average end-to-end time and an average per step, and both
 * are true and neither is useful. The two questions that decide what to do about it are
 * not on the report:
 *
 *  1. **Was anybody working?** Lead time is wall-clock. Touch time is somebody at a
 *     keyboard. In an ordinary back-office process the second is a small single-digit
 *     percentage of the first, and every improvement aimed at the working part is aimed at
 *     the wrong three percent.
 *
 *  2. **How many times did this step happen?** A step-average divides total minutes by
 *     *occurrences*, not by cases. A step that takes forty minutes and happens 1.6 times
 *     per case costs sixty-four minutes a case, and the report says forty.
 *
 * Both are arithmetic, both need only the event log, and both are routinely missing.
 */

import { generate, byCase, days, MINUTES_PER_WORKING_DAY, ACTIVITIES } from "./events.ts";
import { isMain } from "./cli.ts";
import type { Event, Activity } from "./events.ts";

export type CaseTime = {
  caseId: string;
  /** Wall-clock from first event to last. */
  leadMinutes: number;
  /** Minutes somebody was actually working on it. */
  touchMinutes: number;
  /** Everything else. */
  waitMinutes: number;
  steps: number;
  reworkPasses: number;
};

export function perCase(events: Event[] = generate()): CaseTime[] {
  return [...byCase(events).entries()].map(([caseId, list]) => {
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const leadMinutes = last.at + last.touchMinutes - first.at;
    const touchMinutes = list.reduce((s, e) => s + e.touchMinutes, 0);
    return {
      caseId,
      leadMinutes,
      touchMinutes,
      waitMinutes: leadMinutes - touchMinutes,
      steps: list.length,
      reworkPasses: list.filter((e) => e.activity === "information requested").length,
    };
  });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

export type Overall = {
  cases: number;
  meanLeadDays: number;
  medianLeadDays: number;
  p90LeadDays: number;
  meanTouchHours: number;
  /** Share of elapsed time nobody was working. The headline. */
  waitingShare: number;
};

export function overall(times: CaseTime[] = perCase()): Overall {
  const lead = times.map((t) => t.leadMinutes);
  const touch = times.reduce((s, t) => s + t.touchMinutes, 0);
  const total = times.reduce((s, t) => s + t.leadMinutes, 0);
  return {
    cases: times.length,
    meanLeadDays: days(lead.reduce((a, b) => a + b, 0) / times.length),
    medianLeadDays: days(median(lead)),
    p90LeadDays: days(quantile(lead, 0.9)),
    meanTouchHours: touch / times.length / 60,
    waitingShare: total === 0 ? 0 : 1 - touch / total,
  };
}

export type StepTime = {
  activity: Activity;
  /** How many times it happened, across all cases. */
  occurrences: number;
  /** Occurrences divided by cases. Above 1 means rework. */
  perCase: number;
  /** What a report shows: total minutes over occurrences. */
  meanPerOccurrence: number;
  /** What it actually costs a case: total minutes over cases. */
  meanPerCase: number;
  /** Median wait *before* this activity, in minutes. */
  medianWaitBefore: number;
};

export function perStep(events: Event[] = generate()): StepTime[] {
  const cases = byCase(events);
  const totals = new Map<Activity, { minutes: number; n: number; waits: number[] }>();

  for (const list of cases.values()) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const found = totals.get(e.activity) ?? { minutes: 0, n: 0, waits: [] };
      found.minutes += e.touchMinutes;
      found.n++;
      if (i > 0) {
        const prev = list[i - 1]!;
        found.waits.push(e.at - (prev.at + prev.touchMinutes));
      }
      totals.set(e.activity, found);
    }
  }

  return ACTIVITIES
    .filter((a) => totals.has(a))
    .map((activity) => {
      const t = totals.get(activity)!;
      return {
        activity,
        occurrences: t.n,
        perCase: t.n / cases.size,
        meanPerOccurrence: t.minutes / t.n,
        meanPerCase: t.minutes / cases.size,
        medianWaitBefore: t.waits.length ? median(t.waits) : 0,
      };
    })
    .sort((a, b) => b.meanPerCase - a.meanPerCase);
}

/**
 * The step a report would name as slowest, against the step that actually costs most.
 *
 * A report divides by occurrences and points at the activity with the largest average. The
 * cost to a case is the average multiplied by how often it happens — and the ranking is not
 * the same whenever any step repeats.
 */
export function slowestAgainstCostliest(steps: StepTime[] = perStep()): {
  slowest: StepTime;
  costliest: StepTime;
  same: boolean;
} {
  const slowest = steps.reduce((hi, s) => (s.meanPerOccurrence > hi.meanPerOccurrence ? s : hi), steps[0]!);
  const costliest = steps.reduce((hi, s) => (s.meanPerCase > hi.meanPerCase ? s : hi), steps[0]!);
  return { slowest, costliest, same: slowest.activity === costliest.activity };
}

if (isMain(import.meta)) {
  const events = generate();
  const times = perCase(events);
  const o = overall(times);
  const steps = perStep(events);
  const pc = (x: number) => (x * 100).toFixed(1) + " %";

  console.log(`\n${o.cases.toLocaleString("en-GB")} cases\n`);
  console.log(`  mean end to end        ${o.meanLeadDays.toFixed(1)} working days`);
  console.log(`  median                 ${o.medianLeadDays.toFixed(1)}`);
  console.log(`  90th percentile        ${o.p90LeadDays.toFixed(1)}`);
  console.log(`  mean time worked       ${o.meanTouchHours.toFixed(1)} hours`);
  console.log(`\n  Nobody was working on it for ${pc(o.waitingShare)} of the elapsed time.`);

  console.log("\n\nBy activity\n");
  console.log("activity                 times/case   report says   actually costs   median wait before");
  console.log("─".repeat(94));
  for (const s of steps) {
    console.log(
      `${s.activity.padEnd(24)}${s.perCase.toFixed(2).padStart(10)}` +
      `${(s.meanPerOccurrence.toFixed(0) + " min").padStart(14)}` +
      `${(s.meanPerCase.toFixed(0) + " min").padStart(17)}` +
      `${(days(s.medianWaitBefore).toFixed(1) + " d").padStart(21)}`,
    );
  }

  const c = slowestAgainstCostliest(steps);
  console.log(
    c.same
      ? `\nThe slowest step and the costliest are both \`${c.slowest.activity}\`.`
      : `\nA report ranks by the middle column and names \`${c.slowest.activity}\` — ` +
        `${c.slowest.meanPerOccurrence.toFixed(0)} min a time.\n` +
        `What costs a case most is \`${c.costliest.activity}\`, at ` +
        `${c.costliest.meanPerCase.toFixed(0)} min, because it happens ` +
        `${c.costliest.perCase.toFixed(2)} times per case rather than once.`,
  );

  console.log(
    `\nAnd every minute in those two columns is dwarfed by the one on the right. The work is` +
    `\n${(o.meanTouchHours / 60 / o.meanLeadDays * 100).toFixed(1)} % of the elapsed time; the rest is a file sitting somewhere.` +
    `\nAn improvement aimed at the working part is aimed at ${pc(1 - o.waitingShare)} of the problem.\n`,
  );
}
