import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

const svgBuffer = readFileSync(join(publicDir, 'icon.svg'))

// Standard icon — 192x192
await sharp(svgBuffer)
  .resize(192, 192)
  .png()
  .toFile(join(publicDir, 'icon-192.png'))

console.log('icon-192.png ✓')

// Standard icon — 512x512
await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(join(publicDir, 'icon-512.png'))

console.log('icon-512.png ✓')

// Maskable icon — 512x512 with safe-zone padding (80% content, 10% padding each side)
// Recreate SVG with padding for maskable safe zone
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#F0B429"/>
  <text x="256" y="310" font-family="monospace" font-size="240" font-weight="bold"
        text-anchor="middle" fill="#0A0A0A">B</text>
</svg>`

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(join(publicDir, 'icon-maskable.png'))

console.log('icon-maskable.png ✓')
