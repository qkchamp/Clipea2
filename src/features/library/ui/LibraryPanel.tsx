import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, FolderOpen, FolderPlus, Gamepad2, RefreshCw, Search } from 'lucide-react'
import { api } from '@shared/ui/api'
import { IconButton } from '@shared/ui/atoms'
import { Calendar, EmptyState, PanelHeader } from '@shared/ui/molecules'
import { Popover } from '@shared/ui/organisms/Popover'
import { useScrollingFlag } from '@shared/ui/useScrollingFlag'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import { dayInSearch, filterGames, searchOnDay } from '../domain/libraryClip'
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

const SEARCH_HINT = 'Buscar juego, clip o fecha'

/** Names, a day ("28/10/26") or a time ("04:28"); the day can also be picked on a calendar. */
function SearchField() {
  const query = useLibraryStore((state) => state.query)
  const [picking, setPicking] = useState(false)
  const field = useRef<HTMLLabelElement>(null)
  const setQuery = (value: string): void => useLibraryStore.getState().setQuery(value)

  return (
    <>
      <label ref={field} className={styles.search}>
        <Search size={14} />
        <input
          type="search"
          // Its own name: the calendar button inside the label would lend it its own.
          aria-label={SEARCH_HINT}
          placeholder={SEARCH_HINT}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
        />
        <IconButton
          className={styles.dayButton}
          label="Buscar por fecha"
          active={picking}
          aria-haspopup="dialog"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          <CalendarDays size={14} />
        </IconButton>
      </label>
      {picking ? (
        <Popover anchor={field} label="Buscar por fecha" onClose={() => setPicking(false)}>
          <Calendar
            value={dayInSearch(query, new Date().getFullYear())}
            onPick={(day) => {
              setQuery(searchOnDay(query, day))
              setPicking(false)
            }}
          />
        </Popover>
      ) : null}
    </>
  )
}

/** ShadowPlay recordings of every library folder, grouped by folder and game, newest first. */
export function LibraryPanel() {
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
    <section className={styles.panel} aria-label="Biblioteca">
      <PanelHeader
        className={styles.header}
        title="Biblioteca"
        meta={scans ? `${totalClips} clips` : undefined}
        actions={
          <>
            <IconButton small label="Agregar una carpeta de clips" onClick={() => void addFolder()}>
              <FolderPlus size={16} />
            </IconButton>
            <IconButton small label="Abrir un video de otra carpeta" onClick={() => void openFile()}>
              <FolderOpen size={16} />
            </IconButton>
            <IconButton
              small
              label="Volver a buscar clips"
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
        {loading && !scans ? <p className={styles.status}>Buscando clips…</p> : null}
        {error ? <p className={styles.status}>No pude leer las carpetas: {error}</p> : null}
        {scans && shownClips === 0 ? (
          <EmptyState
            className={styles.empty}
            icon={<Gamepad2 size={18} />}
            title={query ? 'Nada coincide' : 'No hay clips en estas carpetas'}
          >
            {query ? 'Probá con otro nombre o fecha.' : 'Agregá la carpeta de ShadowPlay en Ajustes o abrí un video suelto.'}
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
