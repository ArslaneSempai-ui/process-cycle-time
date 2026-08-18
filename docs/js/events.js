/**
 * The event log — one row per thing that happened, which is the only honest input.
 *
 * A process is normally described to you as a diagram and reported to you as an average:
 * eleven days end to end, four steps, here is the box that takes longest. Both are
 * summaries, and every question worth asking dies in the summary.
 *
 * Whether a case followed the diagram at all. Whether the eleven days were spent working or
 * waiting. Whether the slow step is slow once or quick three times. Whether the average is
 * an average of one population or two. None of that survives aggregation, and all of it is
 * the ordinary content of a process review.
 *
 * So this generates events — case, activity, who, when — and everything else is computed
 * from them, exactly as it has to be when the data comes out of a real system.
 *
 * ---
 *
 * Three things are built in deliberately, because they are what actually happens and what
 * a step-average report cannot see:
 *
 *  1. **Rework.** Files come back. A request for information sends a case backwards, and
 *     the second pass through a step is averaged with the first until it disappears.
 *  2. **Waiting.** The clock runs while nobody is touching the file. Handoffs, queues,
 *     overnight, weekends. Touch time and lead time are different numbers and only one of
 *     them is on the report.
 *  3. **Variants.** The documented path is one route through the process. Real cases take
 *     dozens, and the documented one is frequently a minority.
 *
 * The draw is seeded. Without a fixed seed two measurements cannot be compared, and you end
 * up crediting a process change for what was a different sample.
 */
export const ACTIVITIES = [
    "received",
    "triaged",
    "documents checked",
    "information requested",
    "risk assessed",
    "escalated",
    "chased",
    "approved",
    "rejected",
];
/** The route the procedure document describes. Everything else is a deviation. */
export const DOCUMENTED_PATH = [
    "received", "triaged", "documents checked", "risk assessed", "approved",
];
function draw(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 4_294_967_296;
    };
}
/** A skewed positive draw: most things are quick, a few take much longer. */
function lognormalish(r, median, spread) {
    const u = r() + r() + r() - 1.5;
    return Math.max(1, median * Math.exp(u * spread));
}
/**
 * How long each activity takes somebody, in minutes of actual work.
 *
 * Chosen. Nobody publishes these, and the point of the tool is that they are the *smaller*
 * half of the story anyway — the waiting between them dominates, and the waiting is not an
 * activity anybody records.
 */
export const TOUCH_MINUTES = {
    received: 2,
    triaged: 12,
    "documents checked": 35,
    "information requested": 8,
    "risk assessed": 55,
    escalated: 25,
    chased: 4,
    approved: 6,
    rejected: 6,
};
export const CONFIG = {
    cases: 1_200,
    reworkChance: 0.34,
    reworkAgainChance: 0.28,
    medianWaitMinutes: 240,
    medianCustomerWaitMinutes: 2_400,
    rejectShare: 0.11,
    preTriagedShare: 0.17,
    escalateShare: 0.14,
    chaseChance: 0.41,
    seed: 20260817,
};
const ACTORS = ["A. Diallo", "M. Rossi", "K. Nakamura", "S. Okafor", "L. Bergström"];
export function generate(c = CONFIG) {
    const r = draw(c.seed);
    const events = [];
    for (let i = 0; i < c.cases; i++) {
        const caseId = `C-${String(i + 1).padStart(4, "0")}`;
        let clock = i * 37; // cases arrive spread out
        const actor = ACTORS[Math.floor(r() * ACTORS.length)];
        const emit = (activity, wait) => {
            clock += wait;
            const touch = lognormalish(r, TOUCH_MINUTES[activity], 0.45);
            events.push({ caseId, activity, at: Math.round(clock), touchMinutes: Math.round(touch), actor });
            clock += touch;
        };
        emit("received", 0);
        /* Cases from the pre-triaged channel skip a step, legitimately and undocumentedly. */
        if (r() >= c.preTriagedShare)
            emit("triaged", lognormalish(r, c.medianWaitMinutes, 0.8));
        emit("documents checked", lognormalish(r, c.medianWaitMinutes, 0.8));
        /*
         * The loop. A case that needs information goes back out and comes back in, and the
         * second pass through "documents checked" is a different, usually shorter, piece of
         * work than the first — which is exactly why averaging the two hides it.
         */
        let passes = 0;
        let chance = c.reworkChance;
        while (r() < chance && passes < 4) {
            passes++;
            emit("information requested", lognormalish(r, c.medianWaitMinutes / 2, 0.7));
            /* The customer does not always reply, and somebody has to go and ask again. */
            if (r() < c.chaseChance)
                emit("chased", lognormalish(r, c.medianCustomerWaitMinutes, 0.7));
            emit("documents checked", lognormalish(r, c.medianCustomerWaitMinutes, 0.9));
            chance = c.reworkAgainChance;
        }
        emit("risk assessed", lognormalish(r, c.medianWaitMinutes, 0.8));
        /*
         * A second pair of eyes, and the thing that makes it interesting: an escalation can
         * send the assessment back to be redone. That is rework the procedure does not
         * describe and a step-average report cannot see, because the second assessment is
         * averaged into the first.
         */
        if (r() < c.escalateShare) {
            emit("escalated", lognormalish(r, c.medianWaitMinutes, 0.8));
            if (r() < 0.45)
                emit("risk assessed", lognormalish(r, c.medianWaitMinutes * 1.5, 0.8));
        }
        emit(r() < c.rejectShare ? "rejected" : "approved", lognormalish(r, c.medianWaitMinutes, 0.8));
    }
    return events.sort((a, b) => a.at - b.at);
}
/** The events of one case, in order. */
export function byCase(events) {
    const cases = new Map();
    for (const e of events) {
        const list = cases.get(e.caseId);
        if (list)
            list.push(e);
        else
            cases.set(e.caseId, [e]);
    }
    for (const list of cases.values())
        list.sort((a, b) => a.at - b.at);
    return cases;
}
export const MINUTES_PER_WORKING_DAY = 8 * 60;
export const days = (minutes) => minutes / MINUTES_PER_WORKING_DAY;
