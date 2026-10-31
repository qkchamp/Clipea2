import { useSyncExternalStore } from 'react'
import { getLanguage, messagesFor, onLanguageChange, type Language, type Messages } from '@shared/i18n'

/** The texts in the language in use; the component renders again when the language changes. */
export function useT(): Messages {
  return messagesFor(useLanguage())
}

export function useLanguage(): Language {
  return useSyncExternalStore(onLanguageChange, getLanguage)
}
