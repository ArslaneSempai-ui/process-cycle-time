/**
 * Process reports where the obvious reading is wrong.
 *
 * Every number in these is arithmetically correct. Each one supports a conclusion that the
 * event log contradicts, and each is the ordinary output of a real reporting tool. They are
 * named rather than scored — the point is that somebody can go and look for them on Monday.
 */

import { generate, days, byCase, CONFIG } from "./events.ts";
import { perCase, perStep, overall } from "./time.ts";
import { cohorts } from "./rework.ts";
import { conformance, variants } from "./paths.ts";
import { isMain } from "./cli.ts";

export type Trap = {
  id: string;
  name: string;
  appears: string;
  truth: string;
  caught: string;
  evidence: () => string[];
};

const pc = (x: number) => (x * 100).toFixed(1) + " %";

export const TRAPS: Trap[] = [
  {
    id: "T-AVERAGE",
    name: "The average describes no case in the process",
    appears:
      "We average six working days end to end. Set the target at five and push the team.",
    truth:
      "Two populations, not one. Cases that never came back finish in under three days; " +
      "cases that came back twice take three weeks. Nothing sits at six. A target of five " +
      "is met by every clean case without anybody doing anything, and is unreachable for " +
      "the rest no matter what they do.",
    caught:
      "Never set a target on a mean without looking at the distribution behind it. If the " +
      "median and the mean are far apart, the mean is describing a tail, not a process.",
    evidence: () => {
      const c = cohorts(perCase(generate()));
      const o = overall();
      return [
        `  headline mean          ${o.meanLeadDays.toFixed(1)} days`,
        `  median                 ${o.medianLeadDays.toFixed(1)} days`,
        `  90th percentile        ${o.p90LeadDays.toFixed(1)} days`,
        ``,
        ...c.map((x) => `  ${x.label.padEnd(24)}${x.meanLeadDays.toFixed(1)} days   (${pc(x.share)} of cases)`),
      ];
    },
  },
  {
    id: "T-TOUCH",
    name: "Making the slow step faster fixes almost nothing",
    appears:
      "Risk assessment takes the longest — nearly an hour. Automate it and the process gets " +
      "materially quicker.",
    truth:
      "The whole process involves about two hours of actual work spread over six days. " +
      "Removing the single largest piece of work removes under an hour from a process where " +
      "the file spends 95 % of its life sitting somewhere. The lever is the waiting, and " +
      "the waiting is not an activity anybody records.",
    caught:
      "Compute touch time and lead time separately before scoping any automation. If the " +
      "gap is large, the work is not the constraint and speeding it up is aimed at a few " +
      "percent of the problem.",
    evidence: () => {
      const o = overall();
      const s = perStep();
      const slowest = s.reduce((hi, x) => (x.meanPerOccurrence > hi.meanPerOccurrence ? x : hi), s[0]!);
      return [
        `  mean end to end        ${o.meanLeadDays.toFixed(1)} working days`,
        `  mean time worked       ${o.meanTouchHours.toFixed(1)} hours`,
        `  waiting                ${pc(o.waitingShare)} of elapsed time`,
        ``,
        `  slowest activity       ${slowest.activity}, ${slowest.meanPerOccurrence.toFixed(0)} min`,
        `  removing it entirely   saves ${(slowest.meanPerCase / 60).toFixed(1)} h of the ${o.meanTouchHours.toFixed(1)} h worked,`,
        `                         out of ${(o.meanLeadDays * 8).toFixed(0)} h elapsed`,
      ];
    },
  },
  {
    id: "T-STEPAVG",
    name: "A step average divides by the wrong thing",
    appears:
      "Document checking takes 36 minutes. Risk assessment takes 56. Assessment is the " +
      "bigger cost.",
    truth:
      "A step average divides total minutes by *occurrences*, not by cases. Document " +
      "checking happens 1.5 times per case because cases come back; assessment happens " +
      "once. Per case the gap nearly closes, and a slightly higher rework rate reverses it " +
      "outright — while the report never moves.",
    caught:
      "Ask what the denominator is. If a step can repeat, the number you want is total " +
      "minutes over *cases*, and no reporting tool computes it by default.",
    evidence: () => {
      const s = perStep().filter((x) => x.perCase > 0.5);
      return [
        "  activity                 times/case   per occurrence   per case",
        ...s.map((x) =>
          `  ${x.activity.padEnd(24)}${x.perCase.toFixed(2).padStart(10)}` +
          `${(x.meanPerOccurrence.toFixed(0) + " min").padStart(17)}${(x.meanPerCase.toFixed(0) + " min").padStart(11)}`),
      ];
    },
  },
  {
    id: "T-CONFORM",
    name: "A deviation that is not a violation",
    appears:
      "Seventeen percent of cases skip triage. That is a control failure and needs enforcing.",
    truth:
      "Those cases arrive through a channel that triages upstream. The step is not being " +
      "skipped, it is being done somewhere the log does not describe as triage. The " +
      "procedure documents one route and the business runs two — and calling the second one " +
      "a violation puts a team through a remediation for doing its job.",
    caught:
      "Before treating a deviation as a failure, look at what the cases have in common. A " +
      "deviation shared by a coherent group of cases is usually a second process nobody " +
      "wrote down.",
    evidence: () => {
      const c = conformance();
      const v = variants();
      const skipping = v.filter((x) => !x.path.includes("triaged"));
      const share = skipping.reduce((s, x) => s + x.share, 0);
      return [
        `  cases conforming exactly   ${pc(c.share)}`,
        `  distinct routes            ${c.distinctPaths}`,
        `  routes to cover 80 %       ${c.pathsForFourFifths}`,
        `  cases skipping triage      ${pc(share)}   — every one of them from the pre-triaged channel`,
      ];
    },
  },
  {
    id: "T-SURVIVOR",
    name: "The report is quickest when the process is worst",
    appears:
      "Average handling time improved last month. Something we did is working.",
    truth:
      "A report run at a moment in time sees only cases that have *finished*. The long ones " +
      "are still open and therefore invisible, so a backlog of difficult cases makes the " +
      "average look better while it builds. The metric improves fastest exactly when the " +
      "process is deteriorating.",
    caught:
      "Report on cases by *arrival* cohort, not by completion date, and show how many are " +
      "still open. An average over completions is an average over survivors.",
    evidence: () => {
      const cases = byCase(generate());
      const all = [...cases.values()];
      /* Pretend to report at a cut-off: only cases finished by then are visible. */
      const finish = all.map((l) => l[l.length - 1]!.at);
      const cut = finish.slice().sort((a, b) => a - b)[Math.floor(finish.length * 0.6)]!;
      const visible = all.filter((l) => l[l.length - 1]!.at <= cut);
      const mean = (xs: typeof all) =>
        days(xs.reduce((s, l) => s + (l[l.length - 1]!.at - l[0]!.at), 0) / xs.length);
      return [
        `  mean over every case            ${mean(all).toFixed(1)} days`,
        `  mean over cases closed by the cut-off  ${mean(visible).toFixed(1)} days`,
        `  cases still open at the cut-off  ${all.length - visible.length} of ${all.length}`,
      ];
    },
  },
];

if (isMain(import.meta)) {
  console.log(`\n${TRAPS.length} process reports where the obvious reading is wrong\n`);
  for (const t of TRAPS) {
    console.log(`── ${t.id} — ${t.name}`);
    console.log(`\n   Appears to say:  ${t.appears.replace(/\s+/g, " ")}`);
    console.log(`\n   Actually:        ${t.truth.replace(/\s+/g, " ")}\n`);
    for (const line of t.evidence()) console.log(line);
    console.log(`\n   How to catch it: ${t.caught.replace(/\s+/g, " ")}\n`);
  }
  console.log(
    "Every number above is correct. Each supports a conclusion the event log contradicts,\n" +
    "and each is the ordinary output of a real reporting tool.\n",
  );
}
