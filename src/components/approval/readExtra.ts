/** Read the first present string field from an approval request's `extra` map. */
export function readExtraString(
  extra: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!extra) return ''
  for (const key of keys) {
    const value = extra[key]
    if (typeof value === 'string') return value
  }
  return ''
}
