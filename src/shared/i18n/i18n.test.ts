import { afterEach, describe, expect, it } from 'vitest'
import { formatBytes, formatDuration } from '@shared/domain/time'
import { dayInSearch, formatRecordedAt, searchOnDay } from '@features/library/domain/libraryClip'
import { getLanguage, getT, onLanguageChange, setLanguage } from '.'

const SEP_16_0247 = new Date(2026, 8, 16, 2, 47).getTime()

afterEach(() => setLanguage('es'))

describe('language', () => {
  it('speaks Spanish until told otherwise', () => {
    expect(getLanguage()).toBe('es')
    expect(getT().library.title).toBe('Biblioteca')
  })

  it('switches every text and says so once', () => {
    let calls = 0
    const stop = onLanguageChange(() => calls++)
    setLanguage('en')
    setLanguage('en')
    stop()
    expect(calls).toBe(1)
    expect(getT().library.title).toBe('Library')
  })

  it('writes numbers and dates the way each language does', () => {
    expect(formatBytes(14_200_000)).toBe('14,2 MB')
    expect(formatDuration(9.5)).toBe('9,5 s')
    expect(formatRecordedAt(SEP_16_0247)).toBe('16 sep · 02:47')
    setLanguage('en')
    expect(formatBytes(14_200_000)).toBe('14.2 MB')
    expect(formatDuration(9.5)).toBe('9.5 s')
    expect(formatRecordedAt(SEP_16_0247)).toBe('Sep 16 · 02:47')
  })

  it('reads and writes searched days in the order of the language', () => {
    expect(dayInSearch('03/04', 2026)?.getMonth()).toBe(3)
    expect(searchOnDay('rematch', new Date(2026, 9, 28))).toBe('rematch 28/10/26')
    setLanguage('en')
    expect(dayInSearch('03/04', 2026)?.getMonth()).toBe(2)
    expect(dayInSearch('10/28', 2026)?.getDate()).toBe(28)
    expect(searchOnDay('rematch', new Date(2026, 9, 28))).toBe('rematch 10/28/26')
  })
})
