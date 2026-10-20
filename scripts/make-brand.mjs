/**
 * Brand assets (D161): the RapBooster "rb" logo shared by every RapBooster app,
 * recoloured from its original orange to Advance's green (--color-primary).
 *
 * Inputs are the untouched originals in assets/branding/source/*.orig.png (the
 * same files the other RapBooster apps recolour). Re-running always starts from
 * them, so the script is idempotent. Writes:
 *   assets/branding/icon.png                      app icon (electron-builder builds .icns/.ico from it)
 *   electron/main/services/desktop/icons/*.png    tray: green tile (Windows) and template glyph (macOS)
 *   renderer/components/layout/brand-mark.png     title-bar mark
 *
 * NOTE how the colour is mapped (OKLCH, per pixel — the method LinkDesk uses):
 * the hue becomes the target's; chroma scales by C(target) / C(source orange),
 * so white and greys stay neutral; lightness keeps its position relative to the
 * base orange, which lands exactly on the target. Alpha is never touched, so
 * the shape is identical to the original.
 *
 * Run with: npm run brand
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The logo's base orange (the middle of its gradient). */
const SOURCE_BASE = '#F6822E'
/** Advance's brand green: --color-primary in renderer/app/globals.css. */
const TARGET_BASE = '#007561'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (...p) => join(root, ...p)
const SOURCE = at('assets/branding/source')

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

const toLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h]
}

function oklchToLinear(L, C, h) {
  const rad = (h * Math.PI) / 180
  const A = C * Math.cos(rad)
  const B = C * Math.sin(rad)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** Out-of-gamut colours keep L and h and lose chroma until they fit. */
function oklchToRgb([L, C, h]) {
  let lin = oklchToLinear(L, C, h)
  if (!inGamut(lin)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinear(L, mid, h))) lo = mid
      else hi = mid
    }
    lin = oklchToLinear(L, lo, h)
  }
  return lin.map(fromLinear)
}

const [SRC_L, SRC_C] = rgbToOklch(hexToRgb(SOURCE_BASE))
const [DST_L, DST_C, DST_H] = rgbToOklch(hexToRgb(TARGET_BASE))

function recolorPixel(rgb) {
  const [L, C] = rgbToOklch(rgb)
  const outL =
    L <= SRC_L ? (L * DST_L) / SRC_L : DST_L + ((L - SRC_L) * (1 - DST_L)) / (1 - SRC_L)
  return oklchToRgb([outL, (C * DST_C) / SRC_C, DST_H])
}

/** Recolours an image; returns a sharp pipeline of the green version at full size. */
async function recolored(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const cache = new Map()
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    let rgb = cache.get(key)
    if (!rgb) cache.set(key, (rgb = recolorPixel([data[i], data[i + 1], data[i + 2]])))
    data[i] = rgb[0]
    data[i + 1] = rgb[1]
    data[i + 2] = rgb[2]
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
}

const png = (pipeline, size) =>
  pipeline.clone().resize(size, size).png({ compressionLevel: 9 })

/** macOS menu-bar template: black pixels carrying the mark's alpha (the menu bar tints it). */
async function template(size) {
  const margin = Math.round(size / 16)
  const inner = size - margin * 2
  const { data, info } = await sharp(join(SOURCE, 'logo-mark.orig.png'))
    .trim()
    .resize(inner, inner, { fit: 'contain', background: '#0000' })
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: '#0000',
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 0
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png()
}

// The tile is recoloured once at 1024 px (the originals are 5000 px) to keep this fast.
const tile = await recolored(
  await sharp(join(SOURCE, 'logo-tile.orig.png')).resize(1024, 1024).png().toBuffer(),
)
const icons = at('electron/main/services/desktop/icons')
mkdirSync(icons, { recursive: true })

await png(tile, 1024).toFile(at('assets/branding/icon.png'))
await png(tile, 16).toFile(join(icons, 'tray-16.png'))
await png(tile, 32).toFile(join(icons, 'tray-32.png'))
await (await template(16)).toFile(join(icons, 'trayTemplate-16.png'))
await (await template(32)).toFile(join(icons, 'trayTemplate-32.png'))
// Shown at 32 css px: 96 px stays sharp on a 3× display.
await png(tile, 96).toFile(at('renderer/components/layout/brand-mark.png'))

console.log(`Brand assets written: the rb logo in ${TARGET_BASE}.`)
