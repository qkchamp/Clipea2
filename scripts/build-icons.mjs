// Turns the Higgsfield/Recraft logo (resources/logo-source.svg) into the app icon and the header logo:
// drops the C2PA metadata and the cream corner fills, and clips the tile to a rounded square so the
// corners are transparent.
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const CREAM = 'rgb(255,244,224)'
const SIZE = 2048

const source = readFileSync('resources/logo-source.svg', 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '')
const paths = source.match(/<path[^>]*\/>/g) ?? []

const startsOnBorder = (path) => {
  const match = /d="M ([\d.]+) ([\d.]+)/.exec(path)
  if (!match) return false
  const [x, y] = [Number(match[1]), Number(match[2])]
  return x === 0 || y === 0 || x === SIZE || y === SIZE
}
const kept = paths.filter((path) => !(path.includes(`fill="${CREAM}"`) && startsOnBorder(path)))

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`,
  `<defs><clipPath id="tile"><rect width="${SIZE}" height="${SIZE}" rx="440"/></clipPath></defs>`,
  `<g clip-path="url(#tile)">`,
  ...kept,
  '</g></svg>'
].join('\n')

writeFileSync('resources/icon.svg', svg)
writeFileSync('src/shared/ui/assets/logo.svg', svg)
writeFileSync('resources/icon.png', new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng())

// Multi-size .ico (PNG entries, Windows Vista+) for the Explorer folder icon (desktop.ini).
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const images = ICO_SIZES.map((size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng())
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length + 16 * images.length
const entries = images.map((png, index) => {
  const entry = Buffer.alloc(16)
  const size = ICO_SIZES[index] >= 256 ? 0 : ICO_SIZES[index]
  entry.writeUInt8(size, 0)
  entry.writeUInt8(size, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})
writeFileSync('resources/icon.ico', Buffer.concat([header, ...entries, ...images]))
console.log(`icon ok: ${kept.length}/${paths.length} paths kept, ico ${ICO_SIZES.join('/')}`)
