// Servidor local: sirve la app y envía los correos por SMTP con la cuenta del .env
import express from 'express'
import nodemailer from 'nodemailer'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { exec } from 'node:child_process'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(raiz, '.env'))
} catch {
  console.warn('⚠️  No se encontró .env: el envío automático queda desactivado')
}

const { SMTP_HOST = 'smtp.gmail.com', SMTP_PORT = '465', SMTP_USER, SMTP_PASS, PORT = '5190' } = process.env
const configurado = Boolean(SMTP_USER && SMTP_PASS)

const transporte = configurado
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s/g, '') },
    })
  : null

const app = express()
app.use(express.json({ limit: '10mb' }))

app.get('/api/estado', (_req, res) => res.json({ envio: configurado, desde: SMTP_USER ?? null }))

app.post('/api/enviar', async (req, res) => {
  if (!transporte) return res.status(503).json({ error: 'Falta configurar SMTP_USER y SMTP_PASS en .env' })
  const { para, cc, asunto, html, texto, adjunto } = req.body ?? {}
  if (!para || !asunto || !html) return res.status(400).json({ error: 'Faltan destinatario, asunto o contenido' })
  try {
    const info = await transporte.sendMail({
      from: SMTP_USER,
      to: para,
      cc: cc || undefined,
      subject: asunto,
      html,
      text: texto,
      attachments: adjunto ? [{ filename: adjunto.nombre, content: Buffer.from(adjunto.base64, 'base64') }] : [],
    })
    console.log(`✉️  Enviado a ${para}${cc ? ` (cc ${cc})` : ''}: ${asunto}`)
    res.json({ ok: true, id: info.messageId })
  } catch (e) {
    console.error('Error al enviar:', e.message)
    const auth = /535|Invalid login|Username and Password/i.test(e.message)
    res.status(502).json({ error: auth ? 'Usuario o contraseña de aplicación incorrectos (revisa .env)' : e.message })
  }
})

const dist = path.join(raiz, 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(Number(PORT), '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  console.log(`Precios FFVV listo en ${url}  ·  envío ${configurado ? `activo como ${SMTP_USER}` : 'desactivado'}`)
  if (process.argv.includes('--abrir')) exec(`open ${url}`)
})
