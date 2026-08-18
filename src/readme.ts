/**
 * The figures this README is allowed to state.
 *
 * Typing a figure by hand gives it no link to the thing it describes; generating it does.
 * Another repository here published a headline that disagreed with its own code three
 * separate times before that lesson took.
 */

import { generate, DOCUMENTED_PATH, CONFIG, days } from "./events.ts";
import { conformance, variants, short, activityGaps } from "./paths.ts";
import { perCase, perStep, overall, slowestAgainstCostliest } from "./time.ts";
import { cohorts, costOfRework } from "./rework.ts";
import { bands, totalValue } from "./sensitivity.ts";
import { TRAPS } from "./adversarial.ts";
import { proposals } from "./baselines.ts";
import { INVENTORY } from "./inventory.ts";
import { markdown } from "./provenance.ts";
import { ASSUMPTIONS } from "./assumptions.ts";
import { run as emit, table } from "./figures.ts";

const events = generate();
const times = perCase(events);
const o = overall(times);
const c = conformance(events);
const coh = cohorts(times);
const cost = costOfRework(times);
if (!cost) throw new Error("aucune cohorte sans reprise : le surcoût n'est pas calculable");
const steps = perStep(events);
const props = proposals();

const pc = (x: number) => (x * 100).toFixed(1) + " %";
const money = (x: number) => "$" + Math.round(x).toLocaleString("en-GB");
const clean = coh.find((x) => x.passes === 0)!;
const worst = coh[coh.length - 1]!;

const finding =
  `**The finding.** The process averages **${o.meanLeadDays.toFixed(1)} working days** and no case ` +
  `in it takes ${o.meanLeadDays.toFixed(1)} days. Cases that never came back finish in ` +
  `${clean.meanLeadDays.toFixed(1)}; cases that came back twice take ${worst.meanLeadDays.toFixed(1)}. ` +
  `The mean sits between two populations and describes neither, and a target set on it is met ` +
  `by every case that never had a problem. Meanwhile somebody was actually working for ` +
  `**${o.meanTouchHours.toFixed(1)} hours** of those ${o.meanLeadDays.toFixed(1)} days — ` +
  `${pc(o.waitingShare)} of the elapsed time, the file was sitting somewhere.`;

const conformTable = (() => {
  const v = variants(events);
  const t = table(
    ["Cases", "Share", "Rework", "Route"],
    v.slice(0, 8).map((x) => [
      x.cases, pc(x.share), x.reworkPasses,
      "`" + short(x.path) + "`" + (x.documented ? " ← **documented**" : ""),
    ]),
  );
  const g = activityGaps(events);
  return `The procedure describes one route:\n\n\`${DOCUMENTED_PATH.join(" → ")}\`\n\n` +
    `**${c.conforming.toLocaleString("en-GB")} of ${c.totalCases.toLocaleString("en-GB")} cases followed it exactly — ` +
    `${pc(c.share)}** [${pc(c.low)} – ${pc(c.high)}]. There are **${c.distinctPaths} distinct routes**, and it takes ` +
    `**${c.pathsForFourFifths}** of them to cover four fifths of the cases.\n\n${t}\n\n` +
    (v.length > 8 ? `*${v.length - 8} further routes below these.*\n\n` : "") +
    (g.undocumented.length ? `Happens but is not in the procedure: ${g.undocumented.map((a) => "`" + a + "`").join(", ")}.\n\n` : "") +
    (g.neverHappens.length
      ? `**In the procedure but never observed: ${g.neverHappens.join(", ")}.** A step in the diagram that never runs is usually a control somebody believes in.`
      : `Every documented step is observed at least once — the check exists because a control everybody believes is running, and which never runs, is the most expensive thing this analysis can find.`);
})();

const timeTable = table(
  ["Activity", "Times per case", "A report says", "Actually costs per case", "Median wait before"],
  steps.map((s) => [
    "`" + s.activity + "`", s.perCase.toFixed(2),
    s.meanPerOccurrence.toFixed(0) + " min",
    "**" + s.meanPerCase.toFixed(0) + " min**",
    days(s.medianWaitBefore).toFixed(1) + " d",
  ]),
);

const sc = slowestAgainstCostliest(steps);
const timeNote =
  `A step average divides total minutes by **occurrences**, not by cases. \`documents checked\` ` +
  `happens ${steps.find((s) => s.activity === "documents checked")!.perCase.toFixed(2)} times per case ` +
  `because cases come back, so the two columns disagree — and no reporting tool computes the ` +
  `second one by default.\n\n` +
  (sc.same
    ? `Here the slowest step and the costliest are both \`${sc.slowest.activity}\`, and the gap between ` +
      `the two columns has closed to ${(sc.costliest.meanPerCase - steps.find((s) => s.activity === "documents checked")!.meanPerCase).toFixed(0)} minutes. ` +
      `A slightly higher rework rate reverses it while the report never moves.`
    : `A report names \`${sc.slowest.activity}\`. What costs a case most is \`${sc.costliest.activity}\`.`) +
  `\n\nAnd every minute in both columns is dwarfed by the last one. The work is ` +
  `${pc(1 - o.waitingShare)} of the elapsed time.`;

const cohortTable = table(
  ["", "Cases", "Share", "Mean days", "Median", "Worked", "vs a clean case"],
  coh.map((x) => [
    x.label, x.cases, pc(x.share), "**" + x.meanLeadDays.toFixed(1) + "**",
    x.medianLeadDays.toFixed(1), x.meanTouchHours.toFixed(1) + " h",
    x.timesLonger.toFixed(1) + "×",
  ]),
);

const reworkNote =
  `${cost.affectedCases.toLocaleString("en-GB")} cases went round the loop — **${pc(cost.share)}** ` +
  `[${pc(cost.low)} – ${pc(cost.high)}] — and each spends an extra ` +
  `**${cost.extraDaysPerCase.toFixed(1)} working days** there.\n\n` +
  `Removing all of it takes the process from ${cost.meanDaysBefore.toFixed(1)} days to ` +
  `${cost.meanDaysIfNoRework.toFixed(1)}, and returns ${money(cost.extraCostPerYear)} a year of analyst ` +
  `time.\n\nThat is an upper bound and is meant as one: some rework is a customer sending the ` +
  `wrong file, and no process change prevents that. What the figure is for is comparing against ` +
  `the cost of the change — which is the comparison nobody makes before starting.`;

const sensitivity = (() => {
  const base = totalValue(ASSUMPTIONS);
  const zero = totalValue({ ...ASSUMPTIONS, costPerDayOfDelay: 0 });
  const t = table(
    ["Input", "In use", "At the low end", "At the high end", "Spread"],
    bands().map((b) => [
      "`" + b.name + "`", b.current.toLocaleString("en-GB"),
      `${money(b.atLow)} @ ${b.low.toLocaleString("en-GB")}`,
      `${money(b.atHigh)} @ ${b.high.toLocaleString("en-GB")}`,
      Number.isFinite(b.spread) ? b.spread.toFixed(1) + "×" : "∞",
    ]),
  );
  return `Removing all rework is worth **${money(base)} a year** at the assumptions in use.\n\n${t}\n\n` +
    `With a day of delay priced at zero — which is what happens when nobody can name it — the same ` +
    `work is worth ${money(zero)} rather than ${money(base)}. **A factor of ${(base / zero).toFixed(1)}**, ` +
    `and the difference between a project that gets funded and one that does not.\n\n` +
    `An unpriced cost is not a cost of zero. Treating it as one is how process work loses to ` +
    `whatever happens to have a number attached to it.`;
})();

const traps = TRAPS.map((t) =>
  `### ${t.name}\n\n**Appears to say.** ${t.appears.replace(/\s+/g, " ")}\n\n` +
  `**Actually.** ${t.truth.replace(/\s+/g, " ")}\n\n` +
  "```\n" + t.evidence().join("\n") + "\n```\n\n" +
  `**How to catch it.** ${t.caught.replace(/\s+/g, " ")}`,
).join("\n\n");

const baselines = (() => {
  const t = table(
    ["Proposal", "What it needs", "Days off the clock"],
    props.map((p) => [
      p.name === "remove the rework" ? `**${p.name}**` : p.name,
      p.needs, "**" + p.daysSaved.toFixed(2) + "**",
    ]),
  );
  const best = props.reduce((hi, x) => (x.daysSaved > hi.daysSaved ? x : hi), props[0]!);
  const report = props.find((x) => x.name === "automate the slowest step")!;
  return `${t}\n\n` + props.map((p) => `- **${p.name}** — ${p.why}`).join("\n") +
    `\n\nThe only proposal that moves the clock is worth **${(best.daysSaved / Math.max(report.daysSaved, 0.01)).toFixed(0)}×** ` +
    `the one a step-average report suggests, and it is the only one that needed looking at ` +
    `individual cases rather than at the report.`;
})();

const provenance = markdown(INVENTORY, table);

emit(new URL("../README.md", import.meta.url).pathname,
  { finding, conformTable, timeTable, timeNote, cohortTable, reworkNote, sensitivity, traps, baselines, provenance });
