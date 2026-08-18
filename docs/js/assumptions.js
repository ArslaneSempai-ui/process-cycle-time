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
export const ASSUMPTIONS = {
    loadedHourlyCost: 48,
    casesPerYear: 14_000,
    costPerDayOfDelay: 35,
};
/** Sanity bounds: a screen that accepts $2 an hour is lying to its reader. */
export const BOUNDS = {
    loadedHourlyCost: [15, 300],
    casesPerYear: [500, 500_000],
    costPerDayOfDelay: [0, 1_000],
};
