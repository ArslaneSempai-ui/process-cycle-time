/**
 * Every number this tool puts on a page, and where it came from.
 *
 * The measurement here is the most robust in the portfolio and the assumptions are the
 * least knowable, which is an unusual combination worth naming. An event log is an event
 * log: the mean, the median, the rework share and the waiting share come straight out of
 * it with no modelling in between. Nothing about them is arguable.
 *
 * What is entirely arguable is the third assumption — what a working day of delay costs.
 * Almost nobody can name it, so process business cases quietly price it at zero, and the
 * sweep shows that choice changes the answer by a factor of nine. The least knowable number
 * is the one that decides.
 */

import { ASSUMPTIONS } from "./assumptions.ts";
import { CONFIG, TOUCH_MINUTES, DOCUMENTED_PATH } from "./events.ts";
import type { Inventory } from "./provenance.ts";

export const INVENTORY: Inventory = [
  /* ── measured ── */
  {
    name: "lead time, median, p90",
    provenance: "measured",
    what: "wall-clock from first event to last, per case",
    note: "straight out of the event log — no model between the data and the figure",
  },
  {
    name: "waiting share",
    provenance: "measured",
    what: "elapsed time during which nobody was working on the case",
    note: "lead time minus touch time; the column no process report carries",
  },
  {
    name: "conformance",
    provenance: "measured",
    what: "share of cases following the documented route exactly, and how many routes exist",
    note: "with its 95 % interval, and the count of routes needed to cover four fifths",
  },
  {
    name: "cohorts",
    provenance: "measured",
    what: "lead time split by how many times the case came back",
    note: "the finding: the headline mean sits between two populations and describes neither",
  },
  {
    name: "per-case step cost",
    provenance: "measured",
    what: "total minutes over cases, rather than over occurrences",
    note: "the denominator a step-average report gets wrong whenever a step can repeat",
  },

  /* ── assumed ── */
  {
    name: "loadedHourlyCost",
    provenance: "assumed",
    what: "fully loaded cost of an analyst hour",
    note: "your finance team knows this exactly",
  },
  {
    name: "casesPerYear",
    provenance: "assumed",
    what: "volume through this process in a year",
    note: "you know this one; it scales the answer and changes no decision",
  },
  {
    name: "costPerDayOfDelay",
    provenance: "assumed",
    what: "what one working day of delay costs, per case",
    note: "the least knowable figure here and the one that decides — priced at zero it changes the answer ninefold",
  },

  /* ── chosen ── */
  {
    name: "TOUCH_MINUTES",
    provenance: "chosen",
    what: "how long each activity takes somebody",
    note: "nobody publishes these, and they are the smaller half of the story — the waiting dominates",
  },
  {
    name: "CONFIG",
    provenance: "chosen",
    what: `${CONFIG.cases.toLocaleString("en-GB")} cases, ${(CONFIG.reworkChance * 100).toFixed(0)} % rework, ${(CONFIG.preTriagedShare * 100).toFixed(0)} % arriving pre-triaged`,
    note: "the mechanisms are the ones that actually occur; their rates are mine",
  },
  {
    name: "DOCUMENTED_PATH",
    provenance: "chosen",
    what: `the route the procedure describes: ${DOCUMENTED_PATH.join(" → ")}`,
    note: "a stand-in for a real procedure document, which is the thing conformance is measured against",
  },
  {
    name: "no retrieved figures",
    provenance: "chosen",
    what: "the decision to cite nothing",
    note: "no public source sets a cycle time or a rework rate; citing a consultancy benchmark would look like rigour and be the opposite",
  },
];

export const MUST_DECLARE = {
  assumptions: Object.keys(ASSUMPTIONS),
  activities: Object.keys(TOUCH_MINUTES),
};
