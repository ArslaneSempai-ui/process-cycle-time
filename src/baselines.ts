/**
 * Against the process review that would have happened anyway.
 *
 * A tool that recommends something is only worth its complexity if it beats what somebody
 * would have done without it. These four are what actually gets proposed in the room, and
 * three of them need nothing but the report everybody already has.
 */

import { perCase, perStep, overall } from "./time.ts";
import { cohorts, costOfRework } from "./rework.ts";
import { ASSUMPTIONS } from "./assumptions.ts";
import { generate, days } from "./events.ts";
import { isMain } from "./cli.ts";

export type Proposal = {
  name: string;
  needs: string;
  /** Days taken off the mean, if it worked perfectly. */
  daysSaved: number;
  why: string;
};

export function proposals(): Proposal[] {
  const times = perCase(generate());
  const o = overall(times);
  const steps = perStep();
  const c = costOfRework(times);
  if (!c) return [];

  const slowest = steps.reduce((hi, x) => (x.meanPerOccurrence > hi.meanPerOccurrence ? x : hi), steps[0]!);
  const clean = cohorts(times).find((x) => x.passes === 0)!;

  return [
    {
      name: "remove the rework",
      needs: "the event log, split by whether the case came back",
      daysSaved: o.meanLeadDays - clean.meanLeadDays,
      why: "the two populations do not overlap; removing the loop moves the whole distribution",
    },
    {
      name: "automate the slowest step",
      needs: "a step-average report",
      daysSaved: days(slowest.meanPerCase),
      why: `${slowest.activity} is the largest single piece of work, and work is ${((1 - o.waitingShare) * 100).toFixed(1)} % of elapsed time`,
    },
    {
      name: "hire more analysts",
      needs: "nothing",
      daysSaved: 0,
      why: "capacity does not shorten a queue nobody is in — 95 % of the elapsed time is a file waiting on somebody outside the team",
    },
    {
      name: "set a tighter target",
      needs: "nothing",
      daysSaved: 0,
      why: "a target on the mean is met by cases that never had a problem, and unreachable for the ones that did",
    },
  ];
}

if (isMain(import.meta)) {
  const p = proposals();
  console.log("\nWhat each proposal would actually take off the clock\n");
  console.log("proposal                     needs                                              days saved");
  console.log("─".repeat(96));
  for (const x of p) {
    console.log(`${x.name.padEnd(29)}${x.needs.slice(0, 50).padEnd(52)}${x.daysSaved.toFixed(2).padStart(11)}`);
  }
  console.log();
  for (const x of p) console.log(`  ${x.name}\n    ${x.why}\n`);

  const best = p.reduce((hi, x) => (x.daysSaved > hi.daysSaved ? x : hi), p[0]!);
  console.log(
    `The only proposal that moves the clock is "${best.name}", and it is the only one that\n` +
    `needed looking at the individual cases rather than the report.\n`,
  );
}
