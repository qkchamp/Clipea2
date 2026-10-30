import { describe, expect, it } from 'vitest'
import {
  baseName,
  dayInSearch,
  describeRecording,
  filterGames,
  formatRecordedAt,
  groupByGame,
  hourInSearch,
  isInstantReplay,
  isVideoFile,
  parseLibrarySearch,
  parseRecordedAt,
  recordingLabel,
  searchOnDay,
  searchOnHour,
  stripExtension,
  type LibraryClip
} from './libraryClip'

const clip = (game: string, fileName: string, modifiedMs = 0): LibraryClip => ({
  path: `C:/Videos/NVIDIA/${game}/${fileName}`,
  fileName,
  game,
  folderPath: `C:/Videos/NVIDIA/${game}`,
  sizeBytes: 1,
  modifiedMs,
  recordedAtMs: parseRecordedAt(fileName),
  isInstantReplay: isInstantReplay(fileName)
})

describe('ShadowPlay file names', () => {
  it('parses the recording date from the stamp', () => {
    const at = parseRecordedAt('How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4')
    expect(at).toBe(new Date(2026, 8, 16, 2, 47, 12).getTime())
  })

  it('returns null without a stamp or with an impossible date', () => {
    expect(parseRecordedAt('Crash juego 15 dolares.mp4')).toBeNull()
    expect(parseRecordedAt('X 2026.02.31 - 01.00.00.01.mp4')).toBeNull()
  })

  it('detects Instant Replay saves', () => {
    expect(isInstantReplay('How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4')).toBe(true)
    expect(isInstantReplay('Desktop 2026.09.30 - 00.29.27.02.mp4')).toBe(false)
  })

  it('strips the extension and the DVR suffix', () => {
    expect(stripExtension('Rematch 2026.10.03 - 05.02.06.01.DVR.mp4')).toBe('Rematch 2026.10.03 - 05.02.06.01')
  })

  it('recognises video files', () => {
    expect(isVideoFile('a.MP4')).toBe(true)
    expect(isVideoFile('a.txt')).toBe(false)
    expect(isVideoFile('golazo.1234abcd.partial.mp4')).toBe(false)
  })
})

describe('recording labels', () => {
  it('splits the game from the ShadowPlay stamp', () => {
    expect(describeRecording('How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4')).toEqual({
      title: 'How To Fish',
      recordedAtMs: new Date(2026, 8, 16, 2, 47, 12).getTime()
    })
  })

  it('formats a compact Spanish date', () => {
    expect(formatRecordedAt(new Date(2026, 8, 16, 2, 47, 12).getTime())).toBe('16 sep · 02:47')
  })

  it('labels any path', () => {
    expect(recordingLabel('C:\\Videos\\NVIDIA\\How To Fish\\How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4')).toBe(
      'How To Fish · 16 sep · 02:47'
    )
    expect(recordingLabel('D:/clips/Crash juego.mp4')).toBe('Crash juego')
    expect(baseName('C:\\a\\b.mp4')).toBe('b.mp4')
  })
})

describe('groupByGame', () => {
  it('groups by folder and sorts newest first', () => {
    const games = groupByGame([
      clip('Rematch', 'Rematch 2026.10.01 - 10.00.00.01.mp4'),
      clip('How To Fish', 'How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4'),
      clip('Rematch', 'Rematch 2026.10.03 - 05.02.06.01.mp4')
    ])
    expect(games.map((game) => game.name)).toEqual(['Rematch', 'How To Fish'])
    expect(games[0].clips[0].fileName).toBe('Rematch 2026.10.03 - 05.02.06.01.mp4')
  })

  it('falls back to the modification time when the name has no stamp', () => {
    const games = groupByGame([clip('PARA_DISCORD', 'old.mp4', 1), clip('PARA_DISCORD', 'new.mp4', 2)])
    expect(games[0].clips.map((c) => c.fileName)).toEqual(['new.mp4', 'old.mp4'])
  })
})

describe('filterGames', () => {
  const games = groupByGame([
    clip('Rematch', 'Rematch 2026.10.03 - 05.02.06.01.mp4'),
    clip('Fortnite', 'Fortnite 2026.08.04 - 20.28.08.04.DVR.mp4')
  ])

  it('keeps whole games whose name matches', () => {
    expect(filterGames(games, 'fort').map((g) => g.name)).toEqual(['Fortnite'])
  })

  it('returns everything for an empty query', () => {
    expect(filterGames(games, '  ')).toHaveLength(2)
  })
})

describe('searching by date and time', () => {
  const games = groupByGame([
    clip('Rematch', 'Rematch 2026.10.28 - 04.28.12.01.DVR.mp4'),
    clip('Rematch', 'Rematch 2026.10.28 - 23.05.00.02.DVR.mp4'),
    clip('Rematch', 'Rematch 2025.10.28 - 04.10.00.03.DVR.mp4'),
    clip('Fortnite', 'Fortnite 2026.04.03 - 20.28.08.04.DVR.mp4'),
    clip('PARA_DISCORD', 'golazo.mp4', new Date(2026, 9, 28, 12, 0).getTime())
  ])
  const found = (query: string): string[] => filterGames(games, query).flatMap((game) => game.clips.map((c) => c.fileName))

  it('reads the day as DD/MM, and as MM/DD when that is the only date', () => {
    expect(parseLibrarySearch('28/10/26').day).toEqual({ day: 28, month: 10, year: 2026 })
    expect(parseLibrarySearch('10/28/2026').day).toEqual({ day: 28, month: 10, year: 2026 })
    expect(parseLibrarySearch('03/04/26').day).toEqual({ day: 3, month: 4, year: 2026 })
    expect(parseLibrarySearch('28/10').day).toEqual({ day: 28, month: 10, year: null })
    expect(parseLibrarySearch('28/10/2').day).toEqual({ day: 28, month: 10, year: null })
  })

  it('keeps the names apart from the day and the time', () => {
    expect(parseLibrarySearch('  Rematch 28/10/26 04:2 ')).toEqual({
      text: 'rematch',
      day: { day: 28, month: 10, year: 2026 },
      time: { hour: 4, minutes: '2' }
    })
  })

  it('finds the clips of a day, with the year or in any year', () => {
    expect(found('28/10/26')).toEqual([
      'Rematch 2026.10.28 - 23.05.00.02.DVR.mp4',
      'Rematch 2026.10.28 - 04.28.12.01.DVR.mp4',
      'golazo.mp4'
    ])
    expect(found('10/28/2025')).toEqual(['Rematch 2025.10.28 - 04.10.00.03.DVR.mp4'])
    expect(found('28/10')).toHaveLength(4)
    expect(found('3/4/26')).toEqual(['Fortnite 2026.04.03 - 20.28.08.04.DVR.mp4'])
  })

  it('narrows by hour and minutes, and by name', () => {
    expect(found('04:')).toEqual(['Rematch 2026.10.28 - 04.28.12.01.DVR.mp4', 'Rematch 2025.10.28 - 04.10.00.03.DVR.mp4'])
    expect(found('28/10/26 4:28')).toEqual(['Rematch 2026.10.28 - 04.28.12.01.DVR.mp4'])
    expect(found('discord 28/10')).toEqual(['golazo.mp4'])
  })

  it('finds nothing for a date that does not exist', () => {
    expect(found('31/13/26')).toEqual([])
    expect(found('25:00')).toEqual([])
  })

  it('puts the picked day in the search, in place of the one typed', () => {
    expect(searchOnDay('Rematch 03/04', new Date(2026, 9, 28))).toBe('Rematch 28/10/26')
    expect(searchOnDay('', new Date(2026, 3, 3))).toBe('03/04/26')
  })

  it('reads the hour with AM and PM, with or without a space', () => {
    expect(parseLibrarySearch('4 PM').time).toEqual({ hour: 16, minutes: '' })
    expect(parseLibrarySearch('4pm').time).toEqual({ hour: 16, minutes: '' })
    expect(parseLibrarySearch('12 am').time).toEqual({ hour: 0, minutes: '' })
    expect(parseLibrarySearch('12 PM').time).toEqual({ hour: 12, minutes: '' })
    expect(parseLibrarySearch('4:30 am').time).toEqual({ hour: 4, minutes: '30' })
    expect(parseLibrarySearch('13 pm')).toEqual({ text: '13 pm', day: null, time: null })
    expect(parseLibrarySearch('4')).toEqual({ text: '4', day: null, time: null })
  })

  it('finds the clips of an hour picked with AM or PM', () => {
    expect(found('4 AM')).toEqual(['Rematch 2026.10.28 - 04.28.12.01.DVR.mp4', 'Rematch 2025.10.28 - 04.10.00.03.DVR.mp4'])
    expect(found('28/10/26 11 pm')).toEqual(['Rematch 2026.10.28 - 23.05.00.02.DVR.mp4'])
  })

  it('puts the picked hour in the search, in place of the time typed', () => {
    expect(searchOnHour('Rematch 28/10/26 04:2', 16)).toBe('Rematch 28/10/26 4 PM')
    expect(searchOnHour('rematch 9 am', 0)).toBe('rematch 12 AM')
    expect(searchOnDay('rematch 4 PM', new Date(2026, 9, 28))).toBe('rematch 4 PM 28/10/26')
    expect(hourInSearch('28/10 4 PM')).toBe(16)
    expect(hourInSearch('rematch')).toBeNull()
  })

  it('gives the calendar the day searched', () => {
    expect(dayInSearch('rematch 28/10/25', 2026)).toEqual(new Date(2025, 9, 28))
    expect(dayInSearch('28/10', 2026)).toEqual(new Date(2026, 9, 28))
    expect(dayInSearch('31/02/26', 2026)).toBeNull()
    expect(dayInSearch('rematch', 2026)).toBeNull()
  })
})
