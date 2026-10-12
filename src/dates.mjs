// dates -- pure UTC date-string arithmetic, plus the ONE impure boundary read a daily-tournament
// server needs. Extracted verbatim from apps/ruinfold/src/server/dates.mts (the canonical source;
// apps/durante/src/server/dates.mjs was already a byte-identical, disclosed port of this exact
// subset -- see that file's own header). ISO-week helpers (isoWeekStartUTC/weekDatesUTC/
// nextWeekStartUTC) do NOT move here: they exist only for ruinfold's own weekly-boon rollover,
// which stays local to ruinfold, out of footing's scope.
//
// `todayUTC()` is meant to be called from exactly one place in a consuming app: its own request
// handler, once per incoming request. Everything downstream (leaderboard ranking, run replay)
// takes the resulting string as a parameter -- never calls this function itself -- so tournament
// logic stays a pure function of an injected "today", independently testable without waiting on
// the real calendar.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatUTCDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// isValidDateStr -- shape AND real-calendar validity (rejects e.g. "2026-02-30" by round-tripping
// through Date.UTC and checking the parts survived unchanged).
export function isValidDateStr(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDaysUTC(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return formatUTCDate(new Date(Date.UTC(y, m - 1, d + days)));
}

// todayUTC -- the sole Date.now()-adjacent call this module makes (see header).
export function todayUTC() {
  return formatUTCDate(new Date());
}
