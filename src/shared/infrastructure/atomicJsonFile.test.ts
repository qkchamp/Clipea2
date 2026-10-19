import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AtomicJsonFile } from './atomicJsonFile'

let dir = ''
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('AtomicJsonFile', () => {
  it('keeps the last of many concurrent writes, always valid JSON', async () => {
    dir = await mkdtemp(join(tmpdir(), 'clipea2-'))
    const path = join(dir, 'nested', 'settings.json')
    const file = new AtomicJsonFile(path)
    await Promise.all(Array.from({ length: 25 }, (_, index) => file.write({ index, padding: 'x'.repeat(index * 100) })))
    await file.flush()
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ index: 24 })
    expect(await file.read()).toMatchObject({ index: 24 })
  })

  it('reads a missing or broken file as null', async () => {
    dir = await mkdtemp(join(tmpdir(), 'clipea2-'))
    expect(await new AtomicJsonFile(join(dir, 'none.json')).read()).toBeNull()
  })
})
