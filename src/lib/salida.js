import ExcelJS from 'exceljs'
import { pesos } from './parser'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Colores pensados para Outlook y Gmail (estilos en línea + bgcolor para Outlook de escritorio)
const C = { verde: '#1B6B43', verdeClaro: '#E8F4EC', amarillo: '#FFE94D', amarilloSuave: '#FFF8C4', linea: '#D5DED7', texto: '#1C2620', gris: '#6B776F', zebra: '#F7F9F7' }
const FUENTE = "font-family:Calibri,'Segoe UI',Arial,sans-serif;"

// Tabla con las mismas columnas de la planilla que se envía a Precios FFVV
export function tablaHTML(filas) {
  const th = `${FUENTE}font-size:10pt;font-weight:bold;color:#ffffff;padding:9px 10px;border:1px solid ${C.verde};text-transform:uppercase;letter-spacing:0.3px;`
  const td = `${FUENTE}font-size:10.5pt;color:${C.texto};padding:8px 10px;border:1px solid ${C.linea};`
  const cab = [
    ['CODIGO', 'left'],
    ['DESCRIPCION', 'left'],
    ['PRECIO ACTUAL', 'right'],
    ['PRECIO SOLICITADO', 'right'],
    ['STOCK', 'right'],
    ['Termino', 'center'],
  ]
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;min-width:560px;">
<tr>${cab
    .map(([c, al]) =>
      c === 'PRECIO SOLICITADO'
        ? `<th bgcolor="${C.amarillo}" align="${al}" style="${th}background:${C.amarillo};color:${C.texto};border-color:${C.amarillo};text-align:${al};">${c}</th>`
        : `<th bgcolor="${C.verde}" align="${al}" style="${th}background:${C.verde};text-align:${al};">${c}</th>`
    )
    .join('')}</tr>
${filas
    .map((f, i) => {
      const fondo = i % 2 ? C.zebra : '#ffffff'
      return `<tr>
<td bgcolor="${fondo}" style="${td}background:${fondo};color:${C.gris};">${esc(f.codigo)}</td>
<td bgcolor="${fondo}" style="${td}background:${fondo};font-weight:bold;white-space:nowrap;">${esc(f.descripcion)}</td>
<td bgcolor="${fondo}" align="right" style="${td}background:${fondo};text-align:right;color:${C.gris};white-space:nowrap;">${pesos(f.precioActual)}</td>
<td bgcolor="${C.amarilloSuave}" align="right" style="${td}background:${C.amarilloSuave};text-align:right;font-weight:bold;font-size:12pt;white-space:nowrap;">${pesos(f.precioSolicitado)}</td>
<td bgcolor="${fondo}" align="right" style="${td}background:${fondo};text-align:right;">${esc(f.stock)}</td>
<td bgcolor="${fondo}" align="center" style="${td}background:${fondo};text-align:center;white-space:nowrap;">${esc(f.termino)}</td></tr>`
    })
    .join('\n')}
</table>`
}

function firmaHTML(cfg) {
  const linea = (t, estilo = '') => (t ? `<div style="${FUENTE}font-size:10pt;color:${C.gris};line-height:1.5;${estilo}">${esc(t)}</div>` : '')
  const contacto = [cfg.firmaTelefono, cfg.firmaCorreo].filter(Boolean).join('  ·  ')
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
<tr>
<td width="4" bgcolor="${C.verde}" style="background:${C.verde};width:4px;font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:2px 0 2px 14px;">
${cfg.firmaNombre ? `<div style="${FUENTE}font-size:12pt;font-weight:bold;color:${C.texto};line-height:1.4;">${esc(cfg.firmaNombre)}</div>` : ''}
${linea(cfg.firmaCargo, `color:${C.verde};font-weight:bold;`)}
${linea(cfg.firmaLocal)}
${linea(contacto)}
</td>
</tr>
</table>`
}

export function correoHTML(filas, cfg) {
  const p = (t, estilo = '') => `<p style="${FUENTE}font-size:11pt;color:${C.texto};margin:0 0 14px;line-height:1.5;${estilo}">${esc(t).replace(/\n/g, '<br>')}</p>`
  const unidades = filas.reduce((s, f) => s + (Number(f.stock) || 0), 0)
  const resumen = `${filas.length} producto${filas.length === 1 ? '' : 's'} · ${unidades.toLocaleString('es-CL')} unidades/kg · Término ${esc(filas[0]?.termino ?? '')}`
  return `<div style="${FUENTE}color:${C.texto};">
${p(cfg.saludo)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 10px;"><tr>
<td bgcolor="${C.verdeClaro}" style="background:${C.verdeClaro};border-radius:6px;padding:6px 12px;${FUENTE}font-size:9.5pt;font-weight:bold;color:${C.verde};">SOLICITUD DE BAJA DE PRECIO FFVV &nbsp;·&nbsp; <span style="font-weight:normal;">${resumen}</span></td>
</tr></table>
${tablaHTML(filas)}
${p(cfg.firma, 'margin:20px 0 0;')}
${firmaHTML(cfg)}
</div>`
}

export function correoTexto(filas, cfg) {
  const lineas = filas.map((f) => `• ${f.descripcion} (${f.codigo}): ${pesos(f.precioActual)} → ${pesos(f.precioSolicitado)} · stock ${f.stock} · término ${f.termino}`)
  const firma = [cfg.firmaNombre, cfg.firmaCargo, cfg.firmaLocal, [cfg.firmaTelefono, cfg.firmaCorreo].filter(Boolean).join(' · ')].filter(Boolean)
  return [cfg.saludo, '', ...lineas, '', cfg.firma, ...(firma.length ? ['--', ...firma] : [])].join('\n')
}

export async function copiarCorreo(filas, cfg) {
  const html = correoHTML(filas, cfg)
  const texto = correoTexto(filas, cfg)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([texto], { type: 'text/plain' }),
      }),
    ])
    return 'html'
  } catch {
    // Algunos navegadores o vistas no permiten copiar con formato: se copia el texto
    await navigator.clipboard.writeText(texto)
    return 'texto'
  }
}

export function abrirCorreo(cfg) {
  const q = new URLSearchParams()
  if (cfg.cc) q.set('cc', cfg.cc)
  q.set('subject', cfg.asunto)
  q.set('body', 'Pegar aquí la tabla (Cmd+V / Ctrl+V)')
  window.location.href = `mailto:${cfg.para}?${q.toString().replace(/\+/g, '%20')}`
}

// En la versión publicada (claude.ai) la descarga pasa por la capacidad "downloads";
// en el computador se descarga directo
async function descargar(blob, nombre) {
  const downloads = window.claude ? await window.claude.use('downloads').catch(() => null) : null
  if (downloads) {
    await downloads.save({ filename: nombre, data: blob })
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function excelBuffer(filas) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Hoja1')
  ws.columns = [
    { header: 'CODIGO', key: 'codigo', width: 18 },
    { header: 'DESCRIPCION', key: 'descripcion', width: 38 },
    { header: 'PRECIO ACTUAL', key: 'precioActual', width: 15 },
    { header: 'PRECIO SOLICITADO', key: 'precioSolicitado', width: 19 },
    { header: 'STOCK', key: 'stock', width: 9 },
    { header: 'Termino', key: 'termino', width: 12 },
  ]
  filas.forEach((f) => ws.addRow({ ...f, codigo: f.codigo ? Number(f.codigo) || f.codigo : '' }))
  const borde = { style: 'thin' }
  ws.eachRow((row, i) => {
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = { top: borde, left: borde, bottom: borde, right: borde }
      if (i === 1) c.font = { bold: true }
      if (col === 1) c.numFmt = '0'
      if (col === 3 || col === 4) c.numFmt = '"$" #,##0'
      if (col === 4) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    })
  })
  return wb.xlsx.writeBuffer()
}

export async function descargarExcel(filas, nombre) {
  return descargar(new Blob([await excelBuffer(filas)]), nombre)
}

const aBase64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export async function estadoEnvio() {
  try {
    const r = await fetch('/api/estado')
    return r.ok ? await r.json() : { envio: false }
  } catch {
    return { envio: false }
  }
}

// Envía el correo por el servidor local (server/index.js) con la planilla adjunta
export async function enviarCorreo(filas, cfg, nombreExcel) {
  const r = await fetch('/api/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      para: cfg.para,
      cc: cfg.cc,
      asunto: cfg.asunto,
      html: correoHTML(filas, cfg),
      texto: correoTexto(filas, cfg),
      adjunto: { nombre: nombreExcel, base64: aBase64(await excelBuffer(filas)) },
    }),
  })
  const res = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(res.error || 'No se pudo enviar el correo')
  return res
}

export async function descargarCatalogo(catalogo) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Hoja2')
  ws.addRow(['CODIGO', 'DESCRIPCION', 'PRECIO ACTUAL', 'PRECIO SOLICITADO', 'STOCK'])
  catalogo.forEach((p) => ws.addRow([p.codigo ? Number(p.codigo) || p.codigo : '', p.descripcion, p.precioActual, p.precioSolicitado, p.stock]))
  ws.getColumn(1).numFmt = '0'
  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 40
  return descargar(new Blob([await wb.xlsx.writeBuffer()]), 'Catalogo FFVV.xlsx')
}

// Importa la planilla de productos (busca la hoja con columna DESCRIPCION)
export async function importarCatalogo(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const val = (c) => {
    const v = c.value
    if (v && typeof v === 'object') return v.result ?? v.text ?? ''
    return v ?? ''
  }
  let mejor = []
  wb.eachSheet((ws) => {
    const cab = []
    ws.getRow(1).eachCell((c, i) => (cab[i] = String(val(c)).toUpperCase().trim()))
    const col = (n) => cab.findIndex((h) => h && h.startsWith(n))
    const iD = col('DESCRIP')
    if (iD < 0) return
    const iC = col('COD'), iA = col('PRECIO ACT'), iS = col('PRECIO SOL'), iK = col('STOCK')
    const prods = []
    ws.eachRow((r, n) => {
      if (n === 1) return
      const d = String(val(r.getCell(iD))).trim()
      if (!d) return
      prods.push({
        codigo: iC > 0 ? String(val(r.getCell(iC))).trim() : '',
        descripcion: d,
        precioActual: iA > 0 ? Number(val(r.getCell(iA))) || 0 : 0,
        precioSolicitado: iS > 0 ? Number(val(r.getCell(iS))) || 0 : 0,
        stock: iK > 0 ? Number(val(r.getCell(iK))) || 0 : 0,
      })
    })
    if (prods.length > mejor.length) mejor = prods
  })
  return mejor
}
