export const DEFAULT_NEW_SESSION_TITLE = "New session"

export function isDefaultNewSessionTitle(title: string) {
  const clean = title.trim()
  return clean === DEFAULT_NEW_SESSION_TITLE || clean.startsWith(`${DEFAULT_NEW_SESSION_TITLE} - `)
}
