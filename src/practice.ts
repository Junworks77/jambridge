/** Local calendar date used to keep each day's practice total separate. */
export function practiceDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Milliseconds until the next local midnight, including daylight-saving shifts. */
export function msUntilNextLocalDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return Math.max(1, next.getTime() - date.getTime());
}
