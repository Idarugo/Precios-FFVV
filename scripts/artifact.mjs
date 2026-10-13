// Convierte dist/index.html en una página para publicar en claude.ai (sin <html>/<head>/<body>)
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('dist/index.html', 'utf8')
const titulo = html.match(/<title>.*?<\/title>/s)[0]
const estilos = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0])
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0])
// Las librerías traen el carácter U+FFFD literal; se escribe escapado (válido en strings y regex de JS)
const salida = [titulo, ...estilos, '<div id="root"></div>', ...scripts].join('\n').replaceAll('\uFFFD', '\\uFFFD')
writeFileSync('dist/precios-ffvv.html', salida)
console.log(`dist/precios-ffvv.html listo (${(salida.length / 1024).toFixed(0)} KB)`)
