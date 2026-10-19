import { describe, expect, it } from 'vitest'
import {
  baseName,
  describeRecording,
  filterGames,
  formatRecordedAt,
  groupByGame,
  isInstantReplay,
  isVideoFile,
  parseRecordedAt,
  recordingLabel,
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
