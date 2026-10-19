import { groupByGame, type LibraryClip, type LibraryScan } from '../domain/libraryClip'

/** Driven port: wherever the recordings live. */
export interface LibraryRepository {
  listVideoFiles(root: string): Promise<LibraryClip[]>
}

export async function scanLibrary(repository: LibraryRepository, root: string): Promise<LibraryScan> {
  const clips = await repository.listVideoFiles(root)
  return { root, games: groupByGame(clips), totalClips: clips.length }
}
