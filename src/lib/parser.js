// Lee mensajes tipo WhatsApp/correo y los transforma en solicitudes de precio.
// Ej: "Italiano 100 uni $100 manzana liquidación 60 kilo $ 190. Pera 50 kilo $1.990"

export const normalizar = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const UNIDADES = 'unidades|unidad|unid|uni|un|u|kilos|kilo|kgs|kg|k|cajas|caja|bandejas|bandeja|mallas|malla|bolsas|bolsa'
const RUIDO = new Set(['LIQUIDACION', 'LIQ', 'DE', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'A', 'EN', 'POR', 'KG', 'KILO', 'KILOS', 'UNI', 'UN', 'UNID', 'UNIDAD', 'PRECIO', 'XF', 'CON', 'AL'])

const aNumero = (s) => Number(String(s).replace(/[.,\s]/g, '')) || 0

export function leerMensaje(texto) {
  const re = new RegExp(
    `([^\\d$\\n]+?)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES})?\\.?\\s*(?:a|en|x)?\\s*\\$\\s*(\\d[\\d.,]*)`,
    'gi'
  )
  const items = []
  for (const m of texto.matchAll(re)) {
    const nombre = m[1].replace(/^[\s.,;:\-–•*]+|[\s.,;:\-–•*]+$/g, '').trim()
    if (!nombre) continue
    items.push({
      textoOriginal: m[0].trim(),
      nombre,
      cantidad: aNumero(m[2]),
      unidad: (m[3] || '').toLowerCase(),
      precio: aNumero(m[4].replace(/[.,]$/, '')),
    })
  }
  return items
}

const raiz = (t) => t.replace(/(ES|S)$/, '')

// Devuelve los productos del catálogo ordenados por parecido al nombre buscado
export function buscarProducto(nombre, catalogo, limite = 8) {
  const consulta = normalizar(nombre).split(' ').filter((t) => t && !RUIDO.has(t))
  if (!consulta.length) return []
  return catalogo
    .map((p) => {
      const tokens = normalizar(p.descripcion).split(' ')
      let score = 0
      for (const q of consulta) {
        const rq = raiz(q)
        if (tokens.includes(q)) score += 1
        else if (tokens.some((t) => raiz(t) === rq)) score += 0.9
        else if (rq.length >= 3 && tokens.some((t) => t.startsWith(rq) || rq.startsWith(raiz(t)) && t.length >= 4)) score += 0.6
      }
      if (score === 0) return null
      // las solicitudes diarias suelen ser de liquidación: se prefieren esos códigos
      if (tokens.includes('LIQUIDACION')) score += 0.3
      const extras = tokens.filter((t) => !RUIDO.has(t)).length - consulta.length
      score -= Math.max(0, extras) * 0.05
      return { producto: p, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
}

export const hoy = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

export const pesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-CL')
