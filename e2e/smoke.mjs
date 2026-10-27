// End-to-end smoke test on the real app: open a ShadowPlay clip, change speed, step frames,
// draw (each drawing gets its bar in the timeline; stretch it with its grips, give it an effect, mix a
// color, delete it with the trash or the bar's right click menu), build a two-cut montage and export it under the Discord limit. Also covers
// undo, text drawings, remembered selections, cancel without leftovers, the library watcher and
// the session saved on close.
// Run with `CLIPEA2_SAMPLE=<clip.mp4> npm run e2e` (builds first).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { _electron as electron } from 'playwright'

// A ShadowPlay recording whose folder holds at least two more clips (they become the test library).
const SAMPLE = process.env.CLIPEA2_SAMPLE
if (!SAMPLE) {
  console.error('Falta CLIPEA2_SAMPLE: la ruta de un clip de ShadowPlay (su carpeta necesita al menos 3 clips).')
  process.exit(1)
}
const LIMIT = 20_000_000
const artifacts = join(process.cwd(), 'e2e', 'artifacts')
const exportsDir = join(artifacts, 'exports')
const userData = join(artifacts, 'user-data')
const libraryDir = join(artifacts, 'library')
rmSync(artifacts, { recursive: true, force: true })
mkdirSync(exportsDir, { recursive: true })

// A throwaway library (hard links, no copies) so the watcher test never touches the real one.
const game = basename(dirname(SAMPLE))
const gameDir = join(libraryDir, game)
mkdirSync(gameDir, { recursive: true })
const siblings = readdirSync(dirname(SAMPLE)).filter((name) => name.endsWith('.mp4') && name !== basename(SAMPLE))
const other = siblings[0]
const lateArrival = siblings[1]
const addToLibrary = (name) => {
  const from = join(dirname(SAMPLE), name)
  const to = join(gameDir, name)
  try {
    linkSync(from, to)
  } catch {
    copyFileSync(from, to)
  }
}
addToLibrary(basename(SAMPLE))
addToLibrary(other)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitUntil = async (condition, timeoutMs, label) => {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (condition()) return true
    await sleep(200)
  }
  throw new Error(`Tiempo agotado esperando: ${label}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const app = await electron.launch({ args: ['.'], env: { ...process.env, CLIPEA2_USER_DATA: userData } })
const page = await app.firstWindow()
const clipRow = (fileName) => page.locator(`[data-file="${fileName}"]`)
const consoleErrors = []
page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()))
page.on('pageerror', (error) => consoleErrors.push(String(error)))

try {
  await page.setViewportSize({ width: 1480, height: 900 }).catch(() => undefined)
  await page.getByRole('heading', { name: 'Biblioteca' }).waitFor({ timeout: 20_000 })
  // Exports of the test go to e2e/artifacts, never to the real Discord folder.
  await page.evaluate(
    ([outputDir, libraryRoot]) => window.clipea2.settings.update({ outputDir, libraryRoots: [libraryRoot] }),
    [exportsDir, libraryDir]
  )
  await page.reload()
  // The save dialog is native: answer it with the path it suggests (inside the test export folder).
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async (...args) => ({ canceled: false, filePath: (args.length > 1 ? args[1] : args[0]).defaultPath })
  })
  await page.getByRole('heading', { name: 'Biblioteca' }).waitFor({ timeout: 20_000 })
  await page.getByText(/\d+ clips/).first().waitFor({ timeout: 30_000 })
  await page.screenshot({ path: join(artifacts, '01-inicio.png') })

  check('la biblioteca de prueba tiene 2 clips', (await page.getByText('2 clips').count()) > 0)

  // Open the sample from the library like a person would.
  const header = page.getByRole('button', { name: new RegExp(`^${game}`) }).first()
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await clipRow(basename(SAMPLE)).click()
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return Boolean(video && video.readyState >= 2 && video.duration > 0)
  })
  check('abre el clip desde la biblioteca', true)

  // The timeline strip is cached once complete, even when ffmpeg gives one frame less than asked.
  const thumbs = join(userData, 'cache', 'thumbs')
  await waitUntil(
    () => existsSync(thumbs) && readdirSync(thumbs).some((name) => name.startsWith('strip-') && existsSync(join(thumbs, name, 'done'))),
    30_000,
    'tira de miniaturas completa'
  )
  check('la tira de la línea de tiempo queda en caché', true)

  const rate = () => page.evaluate(() => document.querySelector('video').playbackRate)
  await page.keyboard.press('Control+ArrowDown')
  check('Ctrl+↓ baja a 0.75x', (await rate()) === 0.75, `rate=${await rate()}`)
  await page.getByText('Velocidad 0.75x').waitFor({ timeout: 2000 })
  check('muestra el OSD de velocidad', true)
  await page.keyboard.press('Control+ArrowUp')
  await page.keyboard.press('Control+ArrowUp')
  check('Ctrl+↑ sube de a 0.25x', (await rate()) === 1.25, `rate=${await rate()}`)
  await page.keyboard.press('Control+r')
  check('Ctrl+R vuelve a 1.00x', (await rate()) === 1, `rate=${await rate()}`)

  // Selection 50 → 60 s typed in the time fields.
  const startField = page.getByRole('textbox', { name: 'Inicio' })
  const endField = page.getByRole('textbox', { name: 'Fin' })
  await startField.fill('50')
  await startField.press('Enter')
  await endField.fill('60')
  await endField.press('Enter')
  await page.getByText('10,0 s').first().waitFor({ timeout: 2000 })
  check('selección 50 → 60 = 10,0 s', true)

  // Frame stepping (wait for the exact frame table first).
  await page.waitForFunction(() => document.querySelector('[title="Número de cuadro exacto"], [data-tip="Número de cuadro exacto"]'), null, { timeout: 15_000 })
  await page.keyboard.press('Home')
  const frameNumber = async () => {
    await page.waitForFunction(() => !document.querySelector('video').seeking)
    const text = await page.getByTitle('Número de cuadro exacto').innerText()
    return Number(/f\s*(\d+)/.exec(text)?.[1])
  }
  const base = await frameNumber()
  await page.keyboard.press('Control+ArrowRight')
  const next = await frameNumber()
  await page.keyboard.press('Control+ArrowLeft')
  await page.keyboard.press('Control+ArrowLeft')
  const previous = await frameNumber()
  check('Ctrl+→ avanza 1 cuadro', next === base + 1, `${base} → ${next}`)
  check('Ctrl+← retrocede 1 cuadro', previous === base - 1, `${next} → ${previous}`)

  // Draw an arrow a few frames after the in point.
  await page.keyboard.press('Home')
  for (let step = 0; step < 3; step++) await page.keyboard.press('Control+ArrowRight')
  await frameNumber()
  await page.keyboard.press('d')
  await page.getByRole('toolbar', { name: 'Herramientas de dibujo' }).waitFor()
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()

  // Two texts in a row: clicking elsewhere commits the first one and opens the second box.
  await page.getByRole('button', { name: 'Texto', exact: true }).click()
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.72)
  await page.getByRole('textbox', { name: 'Texto del dibujo' }).waitFor({ timeout: 2000 })
  await page.keyboard.type('uno')
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.86)
  await page.keyboard.type('dos')
  await page.keyboard.press('Enter')
  await page.screenshot({ path: join(artifacts, '02-dibujo.png') })

  // The cursor stretches a drawing from its grips, an effect shows on its bar, and a color can be mixed with RGB.
  const toolbar = page.getByRole('toolbar', { name: 'Herramientas de dibujo' })
  const alphaAt = (x, y, radius = 6) =>
    page.evaluate(
      ([cx, cy, r]) => {
        const surface = document.querySelector('canvas')
        const ratio = surface.width / surface.getBoundingClientRect().width
        const { data } = surface.getContext('2d').getImageData(Math.round((cx - r) * ratio), Math.round((cy - r) * ratio), Math.round(2 * r * ratio) + 1, Math.round(2 * r * ratio) + 1)
        return data.reduce((max, value, index) => (index % 4 === 3 ? Math.max(max, value) : max), 0)
      },
      [x, y, radius]
    )
  await toolbar.getByRole('button', { name: /^Mover dibujos/ }).click()
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5 + 30, { steps: 6 })
  await page.mouse.up()
  await page.mouse.click(box.x + box.width * 0.95, box.y + box.height * 0.95)
  check('el cursor estira una flecha desde su punta', (await alphaAt(box.width * 0.5 + 60, box.height * 0.5 + 30)) > 150)

  await page.mouse.click(box.x + box.width * 0.4 + 30, box.y + box.height * 0.4 + 15)
  await toolbar.getByRole('button', { name: /^Efectos del dibujo/ }).click()
  await page.locator('#effect-fadeIn').check()
  check('un efecto se pinta en la barra del dibujo', (await page.locator('[data-kind="fadeIn"]').count()) === 1)
  await page.keyboard.press('Escape')
  check('Escape cierra el panel de efectos y sigue el modo dibujo', (await page.getByRole('dialog', { name: 'Efectos del dibujo' }).count()) === 0 && (await toolbar.isVisible()))

  await toolbar.getByRole('button', { name: 'Color personalizado: crear uno con RGB' }).click()
  const mixer = page.getByRole('dialog', { name: 'Color personalizado' })
  await mixer.getByLabel('Rojo (0 a 255)').fill('10')
  await mixer.getByLabel('Verde (0 a 255)').fill('255')
  await mixer.getByLabel('Azul (0 a 255)').fill('40')
  check('el código hex sigue a los valores RGB', (await mixer.getByLabel('Código hex del color').inputValue()) === '#0AFF28')
  // Or typed by hand: the channels follow it.
  await mixer.getByLabel('Código hex del color').fill('ffc389')
  const channels = await Promise.all(['Rojo', 'Verde', 'Azul'].map((name) => mixer.getByLabel(`${name} (0 a 255)`).inputValue()))
  check('un código hex escrito a mano ajusta R, G y B', channels.join(',') === '255,195,137', channels.join(','))
  await mixer.getByRole('button', { name: 'Usar este color' }).click()
  check('mezcla un color propio', (await toolbar.locator('button[aria-label="Color personalizado #ffc389"]').getAttribute('aria-checked')) === 'true')
  check('el color propio lleva un lápiz que lo distingue de los fijos', (await toolbar.locator('button[aria-label="Color personalizado #ffc389"] svg').count()) === 1)

  // The trash deletes the picked drawing.
  const listed = () => page.locator('[aria-label="Dibujos de este video"] li').count()
  await toolbar.getByRole('button', { name: 'Rectángulo', exact: true }).click()
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7, { steps: 6 })
  await page.mouse.up()
  const withExtra = await listed()
  await toolbar.getByRole('button', { name: /^Mover dibujos/ }).click()
  await page.mouse.click(box.x + box.width * 0.08, box.y + box.height * 0.62)
  await toolbar.getByRole('button', { name: 'Borrar el dibujo elegido (Supr)' }).click()
  check('el tacho borra el dibujo elegido', (await listed()) === withExtra - 1, `${withExtra} → ${await listed()}`)
  await page.getByRole('button', { name: 'Cerrar aviso' }).first().click()
  await page.keyboard.press('Escape')
  await page.getByText('3 en este video').waitFor({ timeout: 2000 })
  check('dibuja una flecha', true)
  const drawn = await page.locator('[aria-label="Dibujos de este video"]').innerText()
  check('dos textos seguidos quedan los dos', /uno/.test(drawn) && /dos/.test(drawn), drawn.replace(/\s+/g, ' '))
  const bars = page.locator('[aria-label="Dibujos en la línea de tiempo"] > div > div')
  check('cada dibujo tiene su barra en la línea de tiempo', (await bars.count()) === 3)

  // Right click on a bar: "Editar" opens the drawing with the cursor, "Borrar" deletes it (and Deshacer brings it back).
  await bars.first().click({ button: 'right' })
  const options = await page.getByRole('menu').getByRole('menuitem').allInnerTexts()
  check('clic derecho en una barra ofrece Editar y Borrar', options.join(',') === 'Editar,Borrar', options.join(','))
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  const drawingTools = page.getByRole('toolbar', { name: 'Herramientas de dibujo' })
  await drawingTools.waitFor({ timeout: 2000 })
  check('Editar abre el modo dibujo con el cursor', (await drawingTools.getByRole('button', { name: /^Mover dibujos/ }).getAttribute('aria-pressed')) === 'true')
  await page.keyboard.press('Escape')
  await bars.first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Borrar' }).click()
  await page.getByText('2 en este video').waitFor({ timeout: 2000 })
  await page.getByRole('status').getByRole('button', { name: 'Deshacer' }).click()
  await page.getByText('3 en este video').waitFor({ timeout: 2000 })
  check('Borrar desde el menú quita el dibujo y Deshacer lo trae de vuelta', true)

  // Montage: 50→60 plus 10→13.
  await page.keyboard.press('Enter')
  await startField.fill('10')
  await startField.press('Enter')
  await endField.fill('13')
  await endField.press('Enter')
  await page.keyboard.press('Enter')
  await page.getByText(/2 cortes/).first().waitFor({ timeout: 2000 })
  check('arma un montaje de 2 cortes', true)
  await page.screenshot({ path: join(artifacts, '03-montaje.png') })

  // Undo: removing a cut offers "Deshacer"; Ctrl+Y / Ctrl+Z walk the history.
  await page.getByRole('button', { name: 'Quitar del montaje' }).first().click()
  await page.getByText(/^1 corte ·/).waitFor({ timeout: 2000 })
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await page.getByText(/^2 cortes ·/).waitFor({ timeout: 2000 })
  check('quitar un corte se deshace desde el aviso', true)
  await page.keyboard.press('Control+y')
  await page.getByText(/^1 corte ·/).waitFor({ timeout: 2000 })
  await page.keyboard.press('Control+z')
  await page.getByText(/^2 cortes ·/).waitFor({ timeout: 2000 })
  check('Ctrl+Y rehace y Ctrl+Z deshace', true)

  // Export: the finished clip goes to "Exportados" and the export panel is ready for the next one.
  const started = Date.now()
  await page.keyboard.press('Control+e')
  const newItem = page.locator('li', { hasText: 'Nuevo' })
  await newItem.getByText(/Peso:/).waitFor({ timeout: 180_000 })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  await page.getByRole('status').getByText(/^Exportado «/).waitFor({ timeout: 5000 })
  check('avisa al terminar con Copiar y Mostrar', (await page.getByRole('status').getByRole('button', { name: 'Mostrar' }).count()) === 1)
  await page.screenshot({ path: join(artifacts, '04-exportado.png') })
  check('el clip exportado pasa a la pestaña Exportados', (await page.getByRole('tab', { name: /Exportados/ }).getAttribute('aria-selected')) === 'true')
  const nameField = page.getByRole('textbox', { name: 'Nombre del archivo' })
  check('el panel de exportar queda limpio', (await nameField.inputValue()) === '' && (await page.getByRole('button', { name: /Exportar a disco/ }).isEnabled()))

  const mp4s = () => readdirSync(exportsDir).filter((name) => name.endsWith('.mp4')).sort()
  const [file] = mp4s()
  if (!file) throw new Error(`No apareció el mp4 en ${exportsDir}`)
  const output = join(exportsDir, file)
  const size = statSync(output).size
  check('exporta por debajo de 20 MB', size <= LIMIT, `${(size / 1e6).toFixed(2)} MB en ${seconds}s`)

  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_tag_string,width,height,avg_frame_rate', '-of', 'json', output]).toString()
  )
  const duration = Number(probe.format.duration)
  const video = probe.streams.find((stream) => stream.width)
  check('dura 10 s + 3 s', Math.abs(duration - 13) < 0.15, `${duration.toFixed(3)} s`)
  check('H.265 hvc1 720p30', video.codec_name === 'hevc' && video.codec_tag_string === 'hvc1' && video.height === 720 && video.avg_frame_rate === '30/1', JSON.stringify(video))

  // Next clip: empty the montage, open another recording and the estimate follows it.
  await page.getByRole('tab', { name: /Montaje/ }).click()
  const clear = page.getByRole('button', { name: 'Vaciar' })
  await clear.click()
  await page.getByRole('button', { name: '¿Vaciar?' }).click()
  await clipRow(other).click()
  await page.waitForFunction((name) => decodeURIComponent(document.querySelector('video')?.src ?? '').endsWith(name), other)
  const exportMeta = page.locator('section[aria-label="Exportar"] header > span').first()
  await page.waitForFunction(() => /^\d+,\d s · Discord/.test(document.querySelector('section[aria-label="Exportar"] header > span')?.textContent ?? ''))
  await page.getByText('Peso estimado').waitFor({ timeout: 10_000 })
  const placeholder = await nameField.getAttribute('placeholder')
  check('el siguiente clip muestra su peso estimado', true, `${await exportMeta.innerText()} · nombre sugerido «${placeholder}»`)

  // Going back to the first clip brings back its 10 → 13 selection.
  await clipRow(basename(SAMPLE)).click()
  await page.waitForFunction((name) => decodeURIComponent(document.querySelector('video')?.src ?? '').endsWith(name), basename(SAMPLE))
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1)
  await page.waitForTimeout(300)
  const remembered = `${await startField.inputValue()} → ${await endField.inputValue()}`
  check('recuerda la selección de cada video', remembered === '0:10.00 → 0:13.00', remembered)

  // Re-export the first one from the history.
  await page.getByRole('tab', { name: /Exportados/ }).click()
  await page.getByRole('button', { name: 'Reexportar' }).first().click()
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Exportados"] li').length === 2, null, { timeout: 180_000 })
  const files = mp4s()
  check('reexporta desde el historial', files.length === 2 && files.some((name) => name.endsWith(' (2).mp4')), files.join(' | '))

  // The history survives a restart of the window.
  await page.reload()
  await page.getByRole('tab', { name: /Exportados/ }).click()
  await page.locator('[aria-label="Exportados"] li').nth(1).waitFor({ timeout: 10_000 })
  check('el historial se guarda', (await page.locator('[aria-label="Exportados"] li').count()) === 2)
  await page.screenshot({ path: join(artifacts, '05-historial.png') })

  // Cancelling leaves no file behind (ffmpeg writes to a .partial file until it is done).
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1)
  await page.getByRole('button', { name: 'Todo' }).click()
  await page.keyboard.press('Control+e')
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Cancelar') && !b.disabled),
    null,
    { timeout: 30_000 }
  )
  await page.waitForTimeout(800)
  const partialWhileRunning = readdirSync(exportsDir).filter((name) => name.endsWith('.partial.mp4'))
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByText('Exportación cancelada.').waitFor({ timeout: 15_000 })
  await page.waitForTimeout(500)
  const leftovers = readdirSync(exportsDir).filter((name) => !files.includes(name))
  check('mientras exporta escribe un .partial', partialWhileRunning.length === 1, partialWhileRunning.join(' | '))
  check('cancelar no deja archivos', leftovers.length === 0, leftovers.join(' | '))

  // A recording that appears in the library shows up by itself.
  addToLibrary(lateArrival)
  await page.getByText('3 clips').first().waitFor({ timeout: 15_000 })
  check('la biblioteca se actualiza sola', true)

  // The last edit survives closing the app right after it (no 600 ms debounce loss).
  await page.getByRole('tab', { name: /Montaje/ }).click()
  // Enter on the focused tab would just press the tab: the shortcut needs the focus elsewhere.
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Enter')
  await page.getByText(/^1 corte ·/).waitFor({ timeout: 2000 })
  check('sin errores en la consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (error) {
  check('el flujo terminó sin excepciones', false, String(error?.stack ?? error))
  await page.screenshot({ path: join(artifacts, 'error.png') }).catch(() => undefined)
} finally {
  await app.close()
}

try {
  const session = JSON.parse(readFileSync(join(userData, 'session.json'), 'utf8'))
  check('la sesión se guarda al cerrar', session.montage?.length === 1, `montaje con ${session.montage?.length} cortes`)
} catch (error) {
  check('la sesión se guarda al cerrar', false, String(error))
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} pasos OK`)
process.exit(failed.length === 0 ? 0 : 1)
