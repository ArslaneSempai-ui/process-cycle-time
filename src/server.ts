/**
 * The screen, served locally.
 *
 * The event log is generated once and everything else is computed from it, so the state
 * lives in memory: this is a calculator, not a ledger.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { generate, days } from "./events.ts";
import { variants, conformance, short } from "./paths.ts";
import { perCase, perStep, overall } from "./time.ts";
import { cohorts, costOfRework } from "./rework.ts";
import { totalValue } from "./sensitivity.ts";
import { ASSUMPTIONS, BOUNDS, PROMESSE } from "./assumptions.ts";
import { isMain } from "./cli.ts";
import type { Assumptions } from "./assumptions.ts";

const PORT = Number(process.env.PORT ?? 4900);

let assumptions: Assumptions = { ...ASSUMPTIONS };

const events = generate();
const times = perCase(events);
const allVariants = variants(events);
const TOP = 8;

function json(res: ServerResponse, corps: unknown, code = 200): void {
  const load = JSON.stringify(corps);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(load),
  });
  res.end(load);
}

function corps(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resoudre, rejeter) => {
    let brut = "";
    req.on("data", (b) => { brut += b; if (brut.length > 50_000) rejeter(new Error("request too large")); });
    req.on("end", () => { try { resoudre(brut ? JSON.parse(brut) : {}); } catch (e) { rejeter(e); } });
    req.on("error", rejeter);
  });
}

/*
 * La promesse, et les strates qu'elle sépare.
 *
 * L'outil dit que la moyenne ne décrit aucun cas. Le montrer demande de laisser le lecteur
 * poser lui-même la limite qui l'intéresse — un délai promis — et de lire, cohorte par
 * cohorte, ce que cette promesse tient réellement. Les délais partent donc au complet : ce
 * sont des cas, pas une densité lissée, et c'est le nombre de cas tenus qui répond.
 */
let promesseJours: number = PROMESSE.defaut;


export function etat() {
  const total = totalValue(assumptions);
  const atZero = totalValue({ ...assumptions, costPerDayOfDelay: 0 });
  return {
    overall: overall(times),
    cohorts: cohorts(times),
    conformance: conformance(events),
    /* Only the top routes reach the screen: the tail is 66 rows of one case each, and a
     * table nobody scrolls to the end of is a table nobody reads the top of either. */
    variants: allVariants.slice(0, TOP).map((v) => ({ ...v, short: short(v.path) })),
    moreVariants: Math.max(0, allVariants.length - TOP),
    steps: perStep(events),
    rework: costOfRework(times, assumptions),
    value: { total, atZero, factor: atZero === 0 ? Infinity : total / atZero },
    assumptions,
    bounds: BOUNDS,
    promesse: { jours: promesseJours, bornes: PROMESSE },
    /* Un tableau de délais par cohorte : la figure sépare, elle ne recalcule pas. */
    strates: cohorts(times).map((c) => ({
      nom: c.label,
      passes: c.passes,
      jours: times.filter((t) => Math.min(t.reworkPasses, 2) === c.passes)
        .map((t) => days(t.leadMinutes)),
    })),
  };
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") {
      const html = readFileSync(new URL("./ui.html", import.meta.url).pathname, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }

    if (url.pathname === "/graphes.js") {
      const js = readFileSync(new URL("./graphes.js", import.meta.url).pathname, "utf8");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(js);
      return;
    }

    if (url.pathname === "/registre.css") {
      const css = readFileSync(new URL("./registre.css", import.meta.url).pathname, "utf8");
      res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
      res.end(css);
      return;
    }

    if (url.pathname === "/api/etat") return json(res, etat());

    if (url.pathname === "/api/promesse" && req.method === "POST") {
      const recu = await corps(req);
      const v = Number(recu.jours);
      if (Number.isFinite(v)) promesseJours = Math.min(PROMESSE.haut, Math.max(PROMESSE.bas, v));
      return json(res, etat());
    }

    if (url.pathname === "/api/hypotheses" && req.method === "POST") {
      const recu = await corps(req);
      if (recu.remise) assumptions = { ...ASSUMPTIONS };
      else {
        for (const [cle, [min, max]] of Object.entries(BOUNDS) as [keyof Assumptions, [number, number]][]) {
          const v = recu[cle];
          if (typeof v === "number" && Number.isFinite(v)) {
            assumptions = { ...assumptions, [cle]: Math.min(max, Math.max(min, v)) };
          }
        }
      }
      return json(res, etat());
    }

    res.writeHead(404).end("not found");
  } catch (error) {
    json(res, { erreur: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/* Loopback only: `listen(PORT)` alone exposes the screen to everyone on the network. */
if (isMain(import.meta)) {
  serveur.listen(PORT, "127.0.0.1", () => {
    console.log(`Where the time goes → http://localhost:${PORT}`);
  });
}
