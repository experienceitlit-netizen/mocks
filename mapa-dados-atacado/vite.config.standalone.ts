import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build alternativo (npm run build:standalone): gera um único index.html
// autocontido em dist-standalone/, que abre por duplo clique via file://.

// O favicon fica em public/ e não é inlinado pelo vite-plugin-singlefile;
// embutimos como data URI para o arquivo não depender de nada externo.
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html) {
      const svg = readFileSync('public/favicon.svg', 'utf-8')
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      return html.replace('href="./favicon.svg"', `href="${dataUri}"`)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), inlineFavicon(), viteSingleFile()],
  build: {
    outDir: 'dist-standalone',
    copyPublicDir: false,
  },
})
