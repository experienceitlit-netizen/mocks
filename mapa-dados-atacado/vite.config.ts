import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { catalogoApiPlugin } from './scripts/vite-plugin-catalogo.ts'

// https://vite.dev/config/
export default defineConfig({
  // catalogoApiPlugin tem apply: 'serve' — a API só existe no dev server.
  plugins: [react(), catalogoApiPlugin()],
})
