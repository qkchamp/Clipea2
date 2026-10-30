import { describe, expect, it } from 'vitest'
import { clamp, formatBytes, formatDuration, formatHourOfDay, formatTime, parseTime } from './time'

describe('formatHourOfDay', () => {
  it('names the hour on a 12-hour clock', () => {
    expect(formatHourOfDay(0)).toBe('12 AM')
    expect(formatHourOfDay(4)).toBe('4 AM')
    expect(formatHourOfDay(12)).toBe('12 PM')
    expect(formatHourOfDay(23)).toBe('11 PM')
  })
})

describe('formatTime', () => {
  it('formats minutes, seconds and hundredths', () => {
    expect(formatTime(75.5)).toBe('1:15.50')
    expect(formatTime(0)).toBe('0:00.00')
  })

  it('adds hours when needed', () => {
    expect(formatTime(3725)).toBe('1:02:05.00')
  })

  it('rounds without producing 60 seconds', () => {
    expect(formatTime(59.999)).toBe('1:00.00')
  })

  it('treats invalid values as zero', () => {
    expect(formatTime(Number.NaN)).toBe('0:00.00')
    expect(formatTime(-3)).toBe('0:00.00')
  })
})

describe('parseTime', () => {
  it.each([
    ['50', 50],
    ['50,5', 50.5],
    ['1:19', 79],
    ['01:19.250', 79.25],
    ['1:02:03', 3723],
    ['1m19s', 79],
    ['90s', 90],
    ['2m', 120]
  ])('parses %s', (input, expected) => {
    expect(parseTime(input)).toBeCloseTo(expected)
  })

  it.each(['', 'abc', '1:75', '-3', '1::2'])('rejects %s', (input) => {
    expect(parseTime(input)).toBeNull()
  })
})

describe('formatDuration', () => {
  it('uses seconds below a minute and clock format above', () => {
    expect(formatDuration(9.5)).toBe('9,5 s')
    expect(formatDuration(75)).toBe('1:15')
  })
})

describe('formatBytes', () => {
  it('uses decimal megabytes like Discord', () => {
    expect(formatBytes(14_200_000)).toBe('14,2 MB')
    expect(formatBytes(20_000_000)).toBe('20,0 MB')
    expect(formatBytes(450_000)).toBe('450 KB')
  })
})

describe('clamp', () => {
  it('keeps values within bounds', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
