/** Normalize a task id for case- and separator-insensitive ownership checks. */
export function toTaskToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
