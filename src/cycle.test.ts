import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generate, byCase, DOCUMENTED_PATH, CONFIG, days } from "./events.ts";
import { variants, conformance, activityGaps } from "./paths.ts";
import { perCase, perStep, overall, slowestAgainstCostliest } from "./time.ts";
import { cohorts, costOfRework } from "./rework.ts";
import { bands, totalValue } from "./sensitivity.ts";
import { TRAPS } from "./adversarial.ts";
import { proposals } from "./baselines.ts";
import { INVENTORY, MUST_DECLARE } from "./inventory.ts";
import { ASSUMPTIONS } from "./assumptions.ts";

test("the log is reproducible", () => {
  const a = generate({ ...CONFIG, cases: 100 });
  const b = generate({ ...CONFIG, cases: 100 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, generate({ ...CONFIG, cases: 100, seed: 7 }));
});

test("every case starts at the beginning and ends at an end", () => {
  /* An event log with a case that starts halfway is a log with a join bug in it, and every
   * figure downstream inherits it silently. */
  for (const list of byCase(generate()).values()) {
    assert.equal(list[0]!.activity, "received", `${list[0]!.caseId} does not start with receipt`);
    const last = list[list.length - 1]!.activity;
    assert.ok(last === "approved" || last === "rejected", `${list[0]!.caseId} ends on ${last}`);
  }
});

test("events within a case never go backwards in time", () => {
  for (const list of byCase(generate()).values()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      assert.ok(list[i]!.at >= prev.at + prev.touchMinutes,
        `${prev.caseId}: ${list[i]!.activity} starts before ${prev.activity} finished`);
    }
  }
});

test("the mean sits between two populations and describes neither", () => {
  /*
   * The finding this tool exists to make. If the cohorts ever stop separating, the page's
   * central claim is no longer true and the page has to say something else.
   */
  const times = perCase(generate());
  const c = cohorts(times);
  const o = overall(times);
  const clean = c.find((x) => x.passes === 0)!;
  const worst = c.find((x) => x.passes === 2)!;

  assert.ok(clean.meanLeadDays < o.meanLeadDays, "clean cases must be faster than the headline mean");
  assert.ok(worst.meanLeadDays > o.meanLeadDays * 2, "rework cases must be far slower, or there are not two populations");
  assert.ok(worst.timesLonger > 3, `cases that came back twice are only ${worst.timesLonger.toFixed(1)}× a clean one`);
});

test("waiting dominates working, which is what makes the lever the waiting", () => {
  const o = overall();
  assert.ok(o.waitingShare > 0.85,
    `only ${(o.waitingShare * 100).toFixed(1)} % of elapsed time is waiting — the tool's premise does not hold`);
  assert.ok(o.meanTouchHours < o.meanLeadDays * 8 * 0.15, "touch time must be a small share of the working day");
});

test("a step average and a per-case cost rank steps differently", () => {
  /*
   * Not asserting which step wins — that depends on the rework rate. Asserting that the
   * two denominators produce different numbers whenever a step repeats, which is the claim
   * the page makes.
   */
  const steps = perStep();
  const repeating = steps.filter((s) => s.perCase > 1.1);
  assert.ok(repeating.length > 0, "no step repeats — the denominator point cannot be demonstrated");
  for (const s of repeating) {
    assert.ok(s.meanPerCase > s.meanPerOccurrence,
      `${s.activity} repeats ${s.perCase.toFixed(2)}× a case and costs no more per case than per occurrence`);
  }
});

test("the documented route is a minority, and the log says by how much", () => {
  const c = conformance();
  assert.ok(c.share < 0.6, `${(c.share * 100).toFixed(1)} % conform — too clean to demonstrate anything`);
  assert.ok(c.distinctPaths > 20, `only ${c.distinctPaths} routes — a real log has far more`);
  assert.ok(c.pathsForFourFifths > 1, "if one route covers four fifths, the diagram is fine and there is no finding");
  assert.ok(c.high - c.low > 0, "the conformance share must carry an interval");
});

test("a step in the procedure that never happens would be reported", () => {
  /* Nothing is missing today. The check exists because a control everybody believes is
   * running, and which never runs, is the most expensive thing this analysis can find. */
  const g = activityGaps();
  assert.equal(g.neverHappens.length, 0, `documented but never observed: ${g.neverHappens.join(", ")}`);
  assert.ok(g.undocumented.length > 0, "if nothing is undocumented, the log is too tidy to be real");
});

test("the least knowable assumption is the one that decides", () => {
  /*
   * Pricing a day of delay at zero is what a process business case does when nobody can
   * name the figure. It changes the answer by close to an order of magnitude, and that is
   * the argument for naming it rather than defaulting it.
   */
  const base = totalValue(ASSUMPTIONS);
  const zero = totalValue({ ...ASSUMPTIONS, costPerDayOfDelay: 0 });
  assert.ok(base / zero > 3, `pricing delay at zero only changes the answer ${(base / zero).toFixed(1)}×`);

  const b = bands();
  assert.equal(b.length, Object.keys(ASSUMPTIONS).length, "every assumption must be swept");
});

test("every trap's evidence supports the claim it makes", () => {
  for (const t of TRAPS) {
    assert.ok(t.evidence().length > 0, `${t.id} produced no evidence`);
    assert.ok(t.appears.length > 30 && t.truth.length > 30 && t.caught.length > 30, `${t.id} is incomplete`);
  }

  const avg = TRAPS.find((t) => t.id === "T-AVERAGE")!.evidence().join("\n");
  const nums = [...avg.matchAll(/([\d.]+) days/g)].map((m) => Number(m[1]));
  assert.ok(nums[1]! < nums[0]!, "the median must be below the mean, or the skew claim is wrong");

  const surv = TRAPS.find((t) => t.id === "T-SURVIVOR")!.evidence().join("\n");
  const s = [...surv.matchAll(/([\d.]+) days/g)].map((m) => Number(m[1]));
  assert.ok(s[1]! < s[0]!, "the survivor mean must be lower, or the trap is not one");
});

test("the analysis beats the proposals that need no analysis", () => {
  const p = proposals();
  const best = p.reduce((hi, x) => (x.daysSaved > hi.daysSaved ? x : hi), p[0]!);
  assert.equal(best.name, "remove the rework");
  const report = p.find((x) => x.name === "automate the slowest step")!;
  assert.ok(best.daysSaved > report.daysSaved * 5,
    `removing rework saves ${best.daysSaved.toFixed(2)} days against ${report.daysSaved.toFixed(2)} — not a clear enough margin to publish`);
});

test("nothing the tool runs on is missing from the inventory", () => {
  const declared = new Set(INVENTORY.map((f) => f.name));
  for (const key of MUST_DECLARE.assumptions) {
    assert.ok(declared.has(key), `${key} is an input and the inventory omits it`);
  }
  for (const f of INVENTORY.filter((x) => x.provenance === "chosen")) {
    assert.ok(f.note && f.note.length > 20, `${f.name} is chosen and says nothing about why`);
  }
  assert.equal(INVENTORY.filter((f) => f.provenance === "retrieved").length, 0);
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /no retrieved|cites nothing|nothing is retrieved/i,
    "the README must say why there are no citations, not just have none");
});

test("sans cohorte propre, le surcoût de reprise n'est pas calculable — et le dit", () => {
  /*
   * Trouvé en donnant au modèle un journal étranger où chaque dossier avait été repassé au
   * moins une fois. `cohorts` ne renvoyait alors aucune cohorte à zéro passe, et un `!`
   * tenait lieu de vérification : lecture de propriété sur `undefined`, outil arrêté.
   *
   * Il n'y a pas de bonne valeur à renvoyer dans ce cas — tout le calcul se fait par
   * différence avec les dossiers qui n'ont jamais repassé. Zéro serait un mensonge, une
   * estimation aussi. `null` laisse l'appelant dire la seule chose vraie : on ne sait pas.
   */
  const tous = [
    { caseId: "A", leadMinutes: 900, touchMinutes: 60, waitMinutes: 840, steps: 4, reworkPasses: 1 },
    { caseId: "B", leadMinutes: 1200, touchMinutes: 90, waitMinutes: 1110, steps: 5, reworkPasses: 2 },
  ];
  assert.equal(costOfRework(tous), null);

  /* Un journal vide ne vaut pas mieux qu'un journal sans référence. */
  assert.equal(costOfRework([]), null);

  /* Et le cas normal continue de répondre. */
  const avecPropre = [...tous,
    { caseId: "C", leadMinutes: 300, touchMinutes: 40, waitMinutes: 260, steps: 3, reworkPasses: 0 }];
  const c = costOfRework(avecPropre);
  assert.ok(c && c.affectedCases === 2 && c.share > 0);
});
