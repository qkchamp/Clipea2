import { useEffect, useMemo } from 'react'
import { FolderOpen, Gamepad2, RefreshCw, Search } from 'lucide-react'
import { api } from '@shared/ui/api'
import { IconButton } from '@shared/ui/atoms'
import { EmptyState, PanelHeader } from '@shared/ui/molecules'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import { filterGames } from '../domain/libraryClip'
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

/** ShadowPlay recordings of every library folder, grouped by folder and game, newest first. */
export function LibraryPanel() {
  // Joined so the effect only runs again when the folders change, not on every settings save.
  const rootsKey = useSettingsStore((state) => state.settings?.libraryRoots.join('\n'))
  const libraryRoots = useMemo(() => (rootsKey === undefined ? null : rootsKey.split('\n').filter(Boolean)), [rootsKey])
  const scans = useLibraryStore((state) => state.scans)
  const loading = useLibraryStore((state) => state.loading)
  const error = useLibraryStore((state) => state.error)
  const query = useLibraryStore((state) => state.query)
  const expanded = useLibraryStore((state) => state.expanded)
  const collapsedRoots = useLibraryStore((state) => state.collapsedRoots)
  const activePath = usePlayerStore((state) => state.sourcePath)
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

  const openFile = async (): Promise<void> => {
    const [first] = await api.system.openVideos()
    if (first) openRecording(first)
  }

  return (
    <section className={styles.panel} aria-label="Biblioteca">
      <PanelHeader
        title="Biblioteca"
        meta={scans ? `${totalClips} clips` : undefined}
        actions={
          <>
            <IconButton label="Abrir un video de otra carpeta" onClick={() => void openFile()}>
              <FolderOpen size={16} />
            </IconButton>
            <IconButton
              label="Volver a buscar clips"
              disabled={!libraryRoots?.length || loading}
              onClick={() => libraryRoots && void useLibraryStore.getState().load(libraryRoots)}
            >
              <RefreshCw size={15} />
            </IconButton>
          </>
        }
      />
      <label className={styles.search}>
        <Search size={14} />
        <input
          type="search"
          placeholder="Buscar juego o clip"
          value={query}
          onChange={(event) => useLibraryStore.getState().setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && useLibraryStore.getState().setQuery('')}
        />
      </label>

      <div className={styles.scroll}>
        {loading && !scans ? <p className={styles.status}>Buscando clips…</p> : null}
        {error ? <p className={styles.status}>No pude leer las carpetas: {error}</p> : null}
        {scans && shownClips === 0 ? (
          <EmptyState icon={<Gamepad2 size={20} />} title={query ? 'Nada coincide' : 'No hay clips en estas carpetas'}>
            {query ? 'Probá con otro nombre.' : 'Agregá la carpeta de ShadowPlay en Ajustes o abrí un video suelto.'}
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
