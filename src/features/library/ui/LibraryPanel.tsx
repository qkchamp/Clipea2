import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clock, FolderOpen, FolderPlus, Gamepad2, RefreshCw, Search } from 'lucide-react'
import { getT, type Messages } from '@shared/i18n'
import { api } from '@shared/ui/api'
import { IconButton } from '@shared/ui/atoms'
import { Calendar, EmptyState, HourPicker, PanelHeader, type Heat } from '@shared/ui/molecules'
import { Popover } from '@shared/ui/organisms/Popover'
import { useScrollingFlag } from '@shared/ui/useScrollingFlag'
import { useT } from '@shared/ui/useT'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import {
  clipsPerDay,
  clipsPerHour,
  dayInSearch,
  dayKey,
  filterGames,
  hourInSearch,
  searchOnDay,
  searchOnHour,
  type GameFolder
} from '../domain/libraryClip'
import { GameGroup } from './GameGroup'
import { RootFolder } from './RootFolder'
import { useLibraryStore } from './libraryStore'
import styles from './library.module.css'

export function openRecording(path: string): void {
  const player = usePlayerStore.getState()
  player.stopPreview()
  useTrimStore.getState().stopEditing()
  player.open(path)
}

const PICKERS = {
  hour: { label: (t: Messages) => t.library.searchByHour, icon: <Clock size={14} /> },
  day: { label: (t: Messages) => t.library.searchByDay, icon: <CalendarDays size={14} /> }
} as const

type Picker = keyof typeof PICKERS

const describeClips = (count: number): string => getT().library.clips(count)

/**
 * The clips the pickers count: the list already in memory, counted when a picker opens (a few ms for
 * thousands of clips) and again only when the list or the search changes.
 */
function useLibraryGames(): GameFolder[] {
  const scans = useLibraryStore((state) => state.scans)
  return useMemo(() => scans?.flatMap((scan) => scan.games) ?? [], [scans])
}

function HourSearch({ query, onPick }: { query: string; onPick: (hour: number) => void }) {
  const games = useLibraryGames()
  const heat = useMemo((): Heat<number> => {
    const perHour = clipsPerHour(games, query)
    return { count: (hour) => perHour[hour], max: Math.max(...perHour), describe: describeClips }
  }, [games, query])
  return <HourPicker value={hourInSearch(query)} heat={heat} onPick={onPick} />
}

function DaySearch({ query, onPick }: { query: string; onPick: (day: Date) => void }) {
  const games = useLibraryGames()
  const heat = useMemo((): Heat<Date> => {
    const perDay = clipsPerDay(games, query)
    return { count: (day) => perDay.get(dayKey(day)) ?? 0, max: Math.max(0, ...perDay.values()), describe: describeClips }
  }, [games, query])
  return <Calendar value={dayInSearch(query, new Date().getFullYear())} heat={heat} onPick={onPick} />
}

/** Names, a day ("28/10/26") or a time ("04:28", "4 PM"); the hour and the day can also be picked. */
function SearchField() {
  const query = useLibraryStore((state) => state.query)
  const [picking, setPicking] = useState<Picker | null>(null)
  const field = useRef<HTMLLabelElement>(null)
  const t = useT()
  const setQuery = (value: string): void => useLibraryStore.getState().setQuery(value)
  const pick = (value: string): void => {
    setQuery(value)
    setPicking(null)
  }

  return (
    <>
      <label ref={field} className={styles.search}>
        <Search size={14} />
        <input
          type="search"
          // Its own name: the buttons inside the label would lend it theirs.
          aria-label={t.library.searchHint}
          placeholder={t.library.searchHint}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
        />
        {(Object.keys(PICKERS) as Picker[]).map((picker) => (
          <IconButton
            key={picker}
            className={styles.pickButton}
            label={PICKERS[picker].label(t)}
            active={picking === picker}
            aria-haspopup="dialog"
            aria-expanded={picking === picker}
            onClick={() => setPicking((open) => (open === picker ? null : picker))}
          >
            {PICKERS[picker].icon}
          </IconButton>
        ))}
      </label>
      {picking ? (
        <Popover anchor={field} label={PICKERS[picking].label(t)} onClose={() => setPicking(null)}>
          {picking === 'hour' ? (
            <HourSearch query={query} onPick={(hour) => pick(searchOnHour(query, hour))} />
          ) : (
            <DaySearch query={query} onPick={(day) => pick(searchOnDay(query, day))} />
          )}
        </Popover>
      ) : null}
    </>
  )
}

/** Recordings of every library folder, grouped by folder and game, newest first. */
export function LibraryPanel() {
  const t = useT()
  // Joined so the effect only runs again when the folders change, not on every settings save.
  const rootsKey = useSettingsStore((state) => state.settings?.libraryRoots.join('\n'))
  const libraryRoots = useMemo(() => (rootsKey === undefined ? null : rootsKey.split('\n').filter(Boolean)), [rootsKey])
  const scans = useLibraryStore((state) => state.scans)
  const loading = useLibraryStore((state) => state.loading)
  const error = useLibraryStore((state) => state.error)
  const typed = useLibraryStore((state) => state.query)
  // The field shows each key at once; the list of thousands of clips follows right behind.
  const query = useDeferredValue(typed)
  const expanded = useLibraryStore((state) => state.expanded)
  const collapsedRoots = useLibraryStore((state) => state.collapsedRoots)
  const activePath = usePlayerStore((state) => state.sourcePath)
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollingFlag(scrollRef)
  const folders = useMemo(
    () =>
      (scans ?? [])
        .map((scan) => ({ root: scan.root, games: filterGames(scan.games, query) }))
        .filter((folder) => query === '' || folder.games.length > 0),
    [scans, query]
  )
  const totalClips = scans?.reduce((total, scan) => total + scan.totalClips, 0) ?? 0
  const shownClips = folders.reduce((total, folder) => total + folder.games.reduce((sum, game) => sum + game.clips.length, 0), 0)

  useEffect(() => {
    if (!libraryRoots) return
    void useLibraryStore.getState().load(libraryRoots)
    // New recordings (or deleted ones) show up by themselves.
    void api.library.watch(libraryRoots).catch(() => undefined)
    return api.library.onChanged((root) => {
      if (libraryRoots.includes(root)) void useLibraryStore.getState().refresh(root)
    })
  }, [libraryRoots])

  // A folder just added: brought into view once its clips are in, at the end of the list.
  const [revealRoot, setRevealRoot] = useState<string | null>(null)
  useEffect(() => {
    if (!revealRoot || !scans?.some((scan) => scan.root === revealRoot)) return
    const folders = scrollRef.current?.querySelectorAll<HTMLElement>('[data-root]') ?? []
    for (const folder of folders) if (folder.dataset.root === revealRoot) folder.scrollIntoView({ block: 'start' })
    setRevealRoot(null)
  }, [scans, revealRoot])

  const openFile = async (): Promise<void> => {
    const [first] = await api.system.openVideos()
    if (first) openRecording(first)
  }

  const addFolder = async (): Promise<void> => {
    const folder = await useSettingsStore.getState().addLibraryRoot()
    if (folder) setRevealRoot(folder)
  }

  return (
    <section className={styles.panel} aria-label={t.library.title}>
      <PanelHeader
        className={styles.header}
        title={t.library.title}
        meta={scans ? t.library.clips(totalClips) : undefined}
        actions={
          <>
            <IconButton small label={t.library.addFolder} onClick={() => void addFolder()}>
              <FolderPlus size={16} />
            </IconButton>
            <IconButton small label={t.library.openOther} onClick={() => void openFile()}>
              <FolderOpen size={16} />
            </IconButton>
            <IconButton
              small
              label={t.library.rescan}
              disabled={!libraryRoots?.length || loading}
              onClick={() => libraryRoots && void useLibraryStore.getState().load(libraryRoots)}
            >
              <RefreshCw size={16} />
            </IconButton>
          </>
        }
      />
      <SearchField />

      <div ref={scrollRef} className={styles.scroll}>
        {loading && !scans ? <p className={styles.status}>{t.library.scanning}</p> : null}
        {error ? <p className={styles.status}>{t.library.readError(error)}</p> : null}
        {scans && shownClips === 0 ? (
          <EmptyState
            className={styles.empty}
            icon={<Gamepad2 size={18} />}
            title={query ? t.library.noMatch : t.library.noClips}
          >
            {query ? t.library.tryAnother : t.library.addFolderHint}
          </EmptyState>
        ) : null}
        {shownClips > 0
          ? folders.map((folder) => (
              <RootFolder
                key={folder.root}
                root={folder.root}
                clipCount={folder.games.reduce((sum, game) => sum + game.clips.length, 0)}
                open={query !== '' || !collapsedRoots[folder.root]}
                onToggle={() => useLibraryStore.getState().toggleRoot(folder.root)}
              >
                {folder.games.map((game) => (
                  <GameGroup
                    key={game.path}
                    game={game}
                    expanded={query !== '' || Boolean(expanded[game.path])}
                    activePath={activePath}
                    onToggle={() => useLibraryStore.getState().toggle(game.path)}
                    onOpen={openRecording}
                  />
                ))}
              </RootFolder>
            ))
          : null}
      </div>
    </section>
  )
}
