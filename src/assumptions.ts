/**
 * What nobody here can know, and what a reader supplies instead.
 *
 * The event log is measured. Everything that turns elapsed days into a decision is not —
 * what an analyst hour costs, how many cases a year, what a day of delay is worth to a
 * customer. Each is editable and swept, and the page reports which of them decide anything.
 *
 * The third one is the honest problem. A day of delay has a cost and almost nobody can
 * name it, which is exactly why process work gets justified on analyst hours — the small
 * number that happens to be knowable — while the large one goes unpriced.
 */

export type Assumptions = {
  /** Fully loaded cost of an analyst hour. */
  loadedHourlyCost: number;
  /** Cases through this process in a year. */
  casesPerYear: number;
  /**
   * What one working day of delay costs, per case.
   *
   * Abandonment, chasing, reputation, the cost of holding a decision open. Set to zero and
   * the tool prices only analyst hours — which is what most process business cases do, and
   * the sweep shows how much that changes the answer.
   */
  costPerDayOfDelay: number;
};

export const ASSUMPTIONS: Assumptions = {
  loadedHourlyCost: 48,
  casesPerYear: 14_000,
  costPerDayOfDelay: 35,
};

/** Sanity bounds: a screen that accepts $2 an hour is lying to its reader. */
export const BOUNDS: Record<keyof Assumptions, [number, number]> = {
  loadedHourlyCost: [15, 300],
  casesPerYear: [500, 500_000],
  costPerDayOfDelay: [0, 1_000],
};

/*
 * La promesse : le délai que l'équipe annonce à ses clients.
 *
 * Ce n'est pas une hypothèse du modèle — rien ne s'en déduit. C'est la question que le
 * lecteur apporte, et la seule chose de cette page qu'il connaisse mieux que moi. Les
 * bornes viennent des données : le dossier le plus rapide sort en 0,96 jour ouvré, le plus
 * lent en 52,7 ; au-delà de quarante la ligne ne sépare plus rien.
 */
export const PROMESSE = { defaut: 5, bas: 1, haut: 40 } as const;
