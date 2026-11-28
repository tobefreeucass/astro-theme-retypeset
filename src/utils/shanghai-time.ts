export function shanghaiDay(date: Date = new Date()) {
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}
