/**
 * Build the hosted demo.
 *
 * The model is arithmetic on a seeded draw — no database, no network — so the whole thing
 * compiles to ES modules and runs in the visitor's browser. Every control works, including
 * the one that matters: change what a fix costs and watch the priority order invert while
 * the funnel table above it does not move.
 *
 * That is the finding, and it is the difference between reading a claim and testing it.
 *
 * `src/ui.html` stays the single source; the only difference on the hosted side is a
 * `window.LOCAL` shim answering the same routes with the same shapes.
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { isMain } from "./cli.ts";

const root = new URL("..", import.meta.url).pathname;

const SHIM = `<script type="module">
import { generate } from "./js/events.js";
import { variants, conformance, short } from "./js/paths.js";
import { perCase, perStep, overall } from "./js/time.js";
import { cohorts, costOfRework } from "./js/rework.js";
import { totalValue } from "./js/sensitivity.js";
import { ASSUMPTIONS, BOUNDS } from "./js/assumptions.js";

const events = generate();
const times = perCase(events);
const allVariants = variants(events);
const TOP = 8;
let assumptions = { ...ASSUMPTIONS };

const etat = () => {
  const total = totalValue(assumptions);
  const atZero = totalValue({ ...assumptions, costPerDayOfDelay: 0 });
  return {
    overall: overall(times),
    cohorts: cohorts(times),
    conformance: conformance(events),
    variants: allVariants.slice(0, TOP).map((v) => ({ ...v, short: short(v.path) })),
    moreVariants: Math.max(0, allVariants.length - TOP),
    steps: perStep(events),
    rework: costOfRework(times, assumptions),
    value: { total, atZero, factor: atZero === 0 ? Infinity : total / atZero },
    assumptions, bounds: BOUNDS,
  };
};

window.LOCAL = async (chemin, corps) => {
  if (chemin === "/api/etat") return etat();
  if (chemin === "/api/hypotheses") {
    if (corps.remise) assumptions = { ...ASSUMPTIONS };
    else for (const [cle, [min, max]] of Object.entries(BOUNDS)) {
      const v = corps[cle];
      if (typeof v === "number" && Number.isFinite(v)) {
        assumptions = { ...assumptions, [cle]: Math.min(max, Math.max(min, v)) };
      }
    }
    return etat();
  }
  return {};
};
` + "</" + "script>\n";

const BANNER = `<p class="renvoi" style="margin-bottom:1.5rem">
This runs entirely in your browser — no server, nothing leaves your machine. The event log is
<b>synthetic and seeded</b>. <b>Set the cost of a day of delay to zero</b>, at the bottom —
which is what happens when nobody can name it — and watch the value of the same work fall by
a factor of nine. <a href="https://github.com/ArslaneSempai-ui/process-cycle-time">Source and method</a>.
</p>`;

export function build(): void {
  const docs = root + "docs";
  mkdirSync(docs, { recursive: true });

  let html = readFileSync(root + "src/ui.html", "utf8");
  html = html.replace('href="/registre.css"', 'href="registre.css"');

  /* Under the title, not above it: a note about how the demo works, placed before the page
   * has said what it is, reads as a cookie notice and gets skipped exactly like one. */
  const header = html.indexOf('class="haut"');
  const closes = html.indexOf("\n  </div>", header) + "\n  </div>".length;
  html = html.slice(0, closes) + "\n" + BANNER + html.slice(closes);
  html = html.replace('<script type="module">', SHIM + '<script type="module">');
  writeFileSync(docs + "/index.html", html);

  cpSync(root + "src/registre.css", docs + "/registre.css");
  if (existsSync(root + "images")) cpSync(root + "images", docs + "/images", { recursive: true });
  writeFileSync(docs + "/.nojekyll", "");

  console.log("docs/ built");
}

if (isMain(import.meta)) build();
