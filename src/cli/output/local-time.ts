/** `2026-11-19 09:00 (-05:00)`: this computer's time, with its offset so it reads anywhere. */
export function formatLocalTime(at: number): string {
  const date = new Date(at)
  const two = (value: number) => String(value).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const zone = `${sign}${two(Math.floor(Math.abs(offset) / 60))}:${two(Math.abs(offset) % 60)}`
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())} (${zone})`
}
