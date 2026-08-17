/**
 * The routes cases actually take, against the one the procedure describes.
 *
 * A process diagram is a claim about behaviour, and almost nobody checks it. The check is
 * cheap: group the cases by the sequence of activities they went through, count the groups,
 * and see what share of them the diagram covers.
 *
 * The answer is routinely uncomfortable, and it is uncomfortable in a specific direction —
 * the documented path is usually a **minority**. Everything downstream of that inherits the
 * problem: a training course teaches the minority route, an automation is scoped to it, and
 * a target is set on it.
 *
 * This is called conformance checking in the process-mining literature. It needs no models
 * and no statistics, only the event log people already have and rarely look at.
 */

import { generate, byCase, DOCUMENTED_PATH, CONFIG } from "./events.ts";
import { wilson, ENOUGH } from "./interval.ts";
import { isMain } from "./cli.ts";
import type { Event, Activity, Config } from "./events.ts";

export type Variant = {
  /** The sequence of activities, as a single comparable string. */
  path: Activity[];
  cases: number;
  share: number;
  /** Does this match the documented route exactly? */
  documented: boolean;
  /** How many times the case went round the rework loop. */
  reworkPasses: number;
};

const key = (path: Activity[]) => path.join(" → ");

/**
 * A route in one line.
 *
 * The full activity names run past any terminal, and a route truncated mid-word is worse
 * than an abbreviated one — the reader cannot tell whether the line ended or the process
 * did.
 */
const ABBREV: Record<Activity, string> = {
  received: "rec",
  triaged: "tri",
  "documents checked": "doc",
  "information requested": "req",
  chased: "chase",
  "risk assessed": "risk",
  escalated: "esc",
  approved: "OK",
  rejected: "NO",
};
export const short = (path: Activity[]) => path.map((a) => ABBREV[a]).join(" ");

export function variants(events: Event[] = generate()): Variant[] {
  const cases = byCase(events);
  const counts = new Map<string, { path: Activity[]; n: number }>();

  for (const list of cases.values()) {
    const path = list.map((e) => e.activity);
    const k = key(path);
    const found = counts.get(k);
    if (found) found.n++;
    else counts.set(k, { path, n: 1 });
  }

  const total = cases.size;
  return [...counts.values()]
    .map(({ path, n }) => ({
      path,
      cases: n,
      share: n / total,
      documented: key(path) === key(DOCUMENTED_PATH),
      reworkPasses: path.filter((a) => a === "information requested").length,
    }))
    .sort((a, b) => b.cases - a.cases);
}

export type Conformance = {
  totalCases: number;
  distinctPaths: number;
  /** Cases that followed the documented route exactly. */
  conforming: number;
  share: number;
  low: number;
  high: number;
  /** How many distinct paths it takes to cover four fifths of the cases. */
  pathsForFourFifths: number;
  /** The most common route, whether or not it is the documented one. */
  mostCommon: Variant;
};

export function conformance(events: Event[] = generate()): Conformance {
  const v = variants(events);
  const totalCases = v.reduce((s, x) => s + x.cases, 0);
  const conforming = v.filter((x) => x.documented).reduce((s, x) => s + x.cases, 0);
  const [low, high] = wilson(conforming, totalCases);

  let running = 0;
  let pathsForFourFifths = 0;
  for (const x of v) {
    running += x.cases;
    pathsForFourFifths++;
    if (running / totalCases >= 0.8) break;
  }

  return {
    totalCases,
    distinctPaths: v.length,
    conforming,
    share: totalCases === 0 ? 0 : conforming / totalCases,
    low, high,
    pathsForFourFifths,
    mostCommon: v[0]!,
  };
}

/**
 * Every activity that appears in the log but not in the procedure, and the reverse.
 *
 * The second list is the one worth reading twice. A step in the diagram that never happens
 * is not a harmless leftover: it is usually a control somebody believes is running.
 */
export function activityGaps(events: Event[] = generate()): {
  undocumented: Activity[];
  neverHappens: Activity[];
} {
  const seen = new Set(events.map((e) => e.activity));
  const documented = new Set(DOCUMENTED_PATH);
  return {
    undocumented: [...seen].filter((a) => !documented.has(a)),
    neverHappens: [...documented].filter((a) => !seen.has(a)),
  };
}

if (isMain(import.meta)) {
  const events = generate();
  const c = conformance(events);
  const v = variants(events);
  const pc = (x: number) => (x * 100).toFixed(1) + " %";

  console.log(`\n${c.totalCases.toLocaleString("en-GB")} cases, ${c.distinctPaths} distinct routes through the process\n`);

  console.log("The procedure says:");
  console.log("  " + DOCUMENTED_PATH.join(" → ") + "\n");

  console.log(
    `Cases that followed it exactly: ${c.conforming.toLocaleString("en-GB")} of ` +
    `${c.totalCases.toLocaleString("en-GB")} — **${pc(c.share)}** [${pc(c.low)} – ${pc(c.high)}]\n`
      .replace(/\*\*/g, ""),
  );

  console.log("The routes actually taken\n");
  console.log("  cases    share   rework   route");
  console.log("  " + "─".repeat(96));
  for (const x of v.slice(0, 8)) {
    console.log(
      `  ${String(x.cases).padStart(5)}  ${pc(x.share).padStart(7)}   ${String(x.reworkPasses).padStart(6)}   ` +
      short(x.path) + (x.documented ? "   ← documented" : ""),
    );
  }
  if (v.length > 8) console.log(`  ${String(v.length - 8).padStart(5)} more routes below this`);

  console.log(
    `\nIt takes ${c.pathsForFourFifths} distinct routes to cover four fifths of the cases. A diagram ` +
    `showing one\nof them is not wrong so much as it is a description of a minority.`,
  );

  const g = activityGaps(events);
  if (g.undocumented.length) {
    console.log(`\nHappens but is not in the procedure: ${g.undocumented.join(", ")}`);
  }
  if (g.neverHappens.length) {
    console.log(`\nIn the procedure but never happens: ${g.neverHappens.join(", ")}`);
    console.log("  A step in the diagram that never runs is usually a control somebody believes in.");
  }
  console.log();
}
