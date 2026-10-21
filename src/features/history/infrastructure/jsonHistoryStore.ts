import { AtomicJsonFile } from '@shared/infrastructure/atomicJsonFile'
import { fileExists } from '@shared/infrastructure/fileExists'
import { migrateAnnotations } from '@features/annotations/domain/annotation'
import { addRecord, removeRecord, type ExportRecord, type HistoryEntry } from '../domain/exportRecord'

/** Export history in userData/history.json; the main process owns it so no export is lost. */
export class JsonHistoryStore {
  private records: ExportRecord[] | null = null
  private readonly file: AtomicJsonFile

  constructor(filePath: string) {
    this.file = new AtomicJsonFile(filePath)
  }

  /** Every file is checked at once: 200 exports with their recordings would otherwise be checked one by one. */
  async list(): Promise<HistoryEntry[]> {
    const records = await this.load()
    const paths = [...new Set(records.flatMap((record) => [record.path, ...record.segments.map((segment) => segment.sourcePath)]))]
    const present = new Set((await Promise.all(paths.map(async (path) => ((await fileExists(path)) ? path : null)))).filter(Boolean))
    return records.map((record) => ({
      ...record,
      fileExists: present.has(record.path),
      missingSources: record.segments.filter((segment) => !present.has(segment.sourcePath)).length
    }))
  }

  async add(record: ExportRecord): Promise<void> {
    this.records = addRecord(await this.load(), record)
    await this.persist()
  }

  /** Empties the list; the exported files stay where they are. */
  async clear(): Promise<HistoryEntry[]> {
    this.records = []
    await this.persist()
    return []
  }

  async remove(id: string): Promise<HistoryEntry[]> {
    this.records = removeRecord(await this.load(), id)
    await this.persist()
    return this.list()
  }

  private async load(): Promise<ExportRecord[]> {
    if (this.records) return this.records
    const parsed = await this.file.read()
    // Exports from older versions kept their drawings in the old format.
    this.records = Array.isArray(parsed)
      ? (parsed as ExportRecord[]).map((record) => ({ ...record, annotations: migrateAnnotations(record.annotations ?? []) }))
      : []
    return this.records
  }

  /** Writes are queued and atomic, so two quick exports cannot corrupt the file. */
  private persist(): Promise<void> {
    return this.file.write(this.records ?? [])
  }

  flush(): Promise<void> {
    return this.file.flush()
  }
}
