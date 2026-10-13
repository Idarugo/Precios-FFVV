import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// El build genera un único dist/index.html que se abre con doble clic
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:5190' } },
})
