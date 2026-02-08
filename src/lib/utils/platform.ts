export const isMac = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /mac/i.test(navigator.platform)
}

export const getModifierSymbol = (): string => {
  return isMac() ? '⌘' : 'Ctrl+'
}
