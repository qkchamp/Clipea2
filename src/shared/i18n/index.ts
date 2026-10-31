import { en } from './en'
import { es, type Messages } from './es'

export type { Messages }

/** The languages Clipea2 speaks: Spanish (the original) and English. */
export type Language = 'es' | 'en'

export const LANGUAGES: readonly Language[] = ['es', 'en']

const MESSAGES: Record<Language, Messages> = { es, en }

export const isLanguage = (value: unknown): value is Language => value === 'es' || value === 'en'

let current: Language = 'es'
const listeners = new Set<() => void>()

export const getLanguage = (): Language => current

export const messagesFor = (language: Language): Messages => MESSAGES[language]

/**
 * The texts in the language in use. Read them when they are shown, never keep them: the language can
 * change while the app runs (components use useT, which also re-renders them).
 */
export const getT = (): Messages => MESSAGES[current]

/** Each process (main and the window) keeps its own: both follow the setting. */
export function setLanguage(language: Language): void {
  if (language === current) return
  current = language
  for (const listener of listeners) listener()
}

export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
