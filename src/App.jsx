import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  History,
  Info,
  Leaf,
  Loader2,
  Mail,
  PenLine,
  MessageSquareText,
  Package,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import catalogoInicial from './catalogo.json'
import { leerMensaje, buscarProducto, hoy, pesos } from './lib/parser'
import { copiarCorreo, abrirCorreo, enviarCorreo, estadoEnvio, descargarExcel, descargarCatalogo, importarCatalogo, correoHTML } from './lib/salida'

const CODIGO_GENERICO = '7990008251548'

const AJUSTES_BASE = {
  para: 'preciosffyvv@cugat.cl',
  cc: '',
  asunto: 'Baja de precios Santa María {fecha}',
  saludo: 'Hola buenos días, se solicita baja de precio en FFVV, acá adjunto la planilla.',
  firma: 'Saludos cordiales.',
  firmaNombre: '',
  firmaCargo: 'Frutas y Verduras',
  firmaLocal: 'Local Santa María',
  firmaTelefono: '',
  firmaCorreo: 'rancagua@cugat.cl',
}

// En claude.ai la página publicada no tiene el servidor de envío
const PUBLICADA = typeof window !== 'undefined' && !!window.claude

function useGuardado(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      const v = localStorage.getItem(clave)
      return v ? JSON.parse(v) : inicial
    } catch {
      return inicial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(valor))
    } catch {}
  }, [clave, valor])
  return [valor, setValor]
}

const nuevoId = () => Math.random().toString(36).slice(2, 9)

function filaDesde(producto, extra = {}) {
  return {
    id: nuevoId(),
    codigo: producto?.codigo ?? '',
    descripcion: producto?.descripcion ?? '',
    precioActual: producto?.precioActual ?? 0,
    precioSolicitado: producto?.precioSolicitado ?? 0,
    stock: producto?.stock ?? 0,
    termino: hoy(),
    ...extra,
  }
}

function avisos(f) {
  const a = []
  if (!f.descripcion) a.push('Sin producto: elige uno del catálogo')
  if (!f.codigo) a.push('Falta código')
  else if (f.codigo === CODIGO_GENERICO) a.push('Código genérico, verifica')
  if (f.precioSolicitado <= 0) a.push('Falta precio')
  else if (f.precioActual && f.precioSolicitado >= f.precioActual) a.push('Precio solicitado no es menor al actual')
  return a
}

const descuento = (f) => (f.precioActual > 0 && f.precioSolicitado > 0 && f.precioSolicitado < f.precioActual ? Math.round((1 - f.precioSolicitado / f.precioActual) * 100) : 0)

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const fechaLarga = (d = new Date()) => mayuscula(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))

export default function App() {
  const [tab, setTab] = useState('nueva')
  const [catalogo, setCatalogo] = useGuardado('ffvv.catalogo', catalogoInicial)
  const [ajustesGuardados, setAjustes] = useGuardado('ffvv.ajustes', AJUSTES_BASE)
  const ajustes = { ...AJUSTES_BASE, ...ajustesGuardados }
  const [historial, setHistorial] = useGuardado('ffvv.historial', [])
  const [filas, setFilas] = useGuardado('ffvv.borrador', [])
  const [mensaje, setMensaje] = useState('')
  const [toast, setToast] = useState(null)
  const [servidor, setServidor] = useState({ envio: false })
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const [saliendo, setSaliendo] = useState(new Set())
  const [pregunta, setPregunta] = useState(null)
  const timer = useRef()

  // Ventana de confirmación propia: el diálogo del navegador no funciona en la versión publicada
  const preguntar = (titulo, texto, accion, boton = 'Eliminar') => setPregunta({ titulo, texto, accion, boton })

  async function bajarExcel(f, nombre) {
    try {
      await descargarExcel(f, nombre)
    } catch (e) {
      if (e?.code !== 'declined') notificar('No se pudo descargar el Excel', 'error')
    }
  }

  useEffect(() => {
    estadoEnvio().then(setServidor)
  }, [])

  const notificar = (texto, tipo = 'info') => {
    setToast({ texto, tipo, id: nuevoId() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3400)
  }

  const cfg = { ...ajustes, asunto: ajustes.asunto.replace('{fecha}', hoy()) }

  function leer() {
    const items = leerMensaje(mensaje)
    if (!items.length) return notificar('No encontré productos. Formato: "manzana 60 kilo $190"', 'error')
    const nuevas = items.map((it) => {
      const p = buscarProducto(it.nombre, catalogo)[0]?.producto
      return filaDesde(p, {
        precioSolicitado: it.precio,
        stock: it.cantidad,
        origen: it.textoOriginal,
        busqueda: it.nombre,
        descripcion: p?.descripcion ?? '',
        codigo: p?.codigo ?? '',
        precioActual: p?.precioActual ?? 0,
      })
    })
    setFilas((f) => [...f, ...nuevas])
    setMensaje('')
    notificar(`${nuevas.length} producto${nuevas.length > 1 ? 's' : ''} agregado${nuevas.length > 1 ? 's' : ''}`, 'ok')
  }

  const editar = (id, cambios) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...cambios } : f)))

  // La fila se anima hacia afuera antes de eliminarse
  const quitar = (id) => {
    setSaliendo((s) => new Set(s).add(id))
    setTimeout(() => {
      setFilas((fs) => fs.filter((f) => f.id !== id))
      setSaliendo((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }, 220)
  }

  // Guarda en el catálogo el código y precio actual corregidos, y deja registro en historial
  function registrar() {
    setCatalogo((cat) => {
      const c = [...cat]
      for (const f of filas) {
        if (!f.descripcion) continue
        const i = c.findIndex((p) => p.descripcion === f.descripcion)
        const dato = { codigo: f.codigo, descripcion: f.descripcion, precioActual: f.precioActual, precioSolicitado: f.precioSolicitado, stock: f.stock }
        if (i >= 0) c[i] = { ...c[i], ...dato }
        else c.push(dato)
      }
      return c
    })
    setHistorial((h) => [{ id: nuevoId(), fecha: new Date().toISOString(), filas }, ...h].slice(0, 200))
  }

  const listas = filas.length > 0 && filas.every((f) => f.descripcion && f.precioSolicitado > 0)
  const conAviso = filas.filter((f) => avisos(f).length).length
  const totalStock = filas.reduce((s, f) => s + (Number(f.stock) || 0), 0)
  const descPromedio = filas.length ? Math.round(filas.reduce((s, f) => s + descuento(f), 0) / filas.length) : 0

  const nombreExcel = `Baja precios FFVV ${hoy()}.xlsx`

  async function enviarDirecto() {
    setEnviando(true)
    try {
      await enviarCorreo(filas, cfg, nombreExcel)
      registrar()
      setConfirmando(false)
      setEnviado({ para: cfg.para, n: filas.length })
      setFilas([])
    } catch (e) {
      notificar(e.message, 'error')
    } finally {
      setEnviando(false)
    }
  }

  async function enviar() {
    try {
      await copiarCorreo(filas, cfg)
      registrar()
      abrirCorreo(cfg)
      notificar('Correo copiado. Pégalo en el mensaje nuevo (Cmd+V)', 'ok')
    } catch {
      notificar('No se pudo copiar al portapapeles', 'error')
    }
  }

  async function soloCopiar() {
    try {
      const modo = await copiarCorreo(filas, cfg)
      registrar()
      notificar(modo === 'html' ? 'Copiado con formato. Pégalo en Outlook o Gmail' : 'Copiado como texto. Pégalo en tu correo', 'ok')
    } catch {
      notificar('No se pudo copiar al portapapeles', 'error')
    }
  }

  const tabs = [
    ['nueva', 'Solicitud', ClipboardList, filas.length],
    ['historial', 'Historial', History, historial.length],
    ['catalogo', 'Catálogo', BookOpen, catalogo.length],
    ['ajustes', 'Ajustes', Settings],
  ]

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <div className="logo">
            <Leaf size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1>Precios FFVV</h1>
            <p className="sub">
              Bajas de precio · Santa María <span className="punto" /> <span className="fecha-hoy">{fechaLarga()}</span>
            </p>
          </div>
        </div>
        <nav>
          {tabs.map(([k, t, Icono, n]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <Icono size={16} />
              <span className="tab-texto">{t}</span>
              {n > 0 && <span className="contador">{n}</span>}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'nueva' && (
        <main key="nueva" className="vista-anim">
          <section className="card">
            <Paso n={1} icono={MessageSquareText} titulo="Pega el mensaje" detalle="Desde WhatsApp o correo, tal cual llega" />
            <div className="pegar">
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && leer()}
                placeholder="Italiano 100 uni $100  manzana liquidación 60 kilo $ 190.  Pera liquidación 50 kilo $ 190. Zanahoria 60 kilo $ 290"
                rows={3}
              />
            </div>
            <div className="acciones">
              <button className="primario" onClick={leer} disabled={!mensaje.trim()}>
                <Sparkles size={16} /> Leer mensaje <kbd>⌘↵</kbd>
              </button>
              <AgregarManual catalogo={catalogo} onAgregar={(p) => setFilas((f) => [...f, filaDesde(p)])} />
            </div>
          </section>

          <section className="card">
            <div className="titulo-fila">
              <Paso n={2} icono={ClipboardList} titulo="Revisa la planilla" detalle="Haz clic en cualquier dato para corregirlo" />
              {filas.length > 0 && (
                <button className="fantasma peligro" onClick={() => preguntar('¿Vaciar la planilla?', `Se quitarán los ${filas.length} productos de la solicitud.`, () => setFilas([]), 'Vaciar')}>
                  <Trash2 size={15} /> Vaciar
                </button>
              )}
            </div>

            {filas.length > 0 && (
              <div className="stats">
                <Stat icono={Package} valor={filas.length} etiqueta={filas.length === 1 ? 'producto' : 'productos'} />
                <Stat icono={ClipboardList} valor={totalStock.toLocaleString('es-CL')} etiqueta="unidades / kg" />
                <Stat icono={ArrowDownRight} valor={`${descPromedio}%`} etiqueta="baja promedio" tono="verde" />
                {conAviso > 0 && <Stat icono={AlertTriangle} valor={conAviso} etiqueta={conAviso === 1 ? 'por revisar' : 'por revisar'} tono="ambar" />}
              </div>
            )}

            {filas.length === 0 ? (
              <Vacio icono={Leaf} titulo="Todavía no hay productos" texto="Pega un mensaje arriba o agrega uno a mano." />
            ) : (
              <div className="tabla-wrap">
                <table className="planilla">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th className="der">Precio actual</th>
                      <th className="amarillo der">Precio solicitado</th>
                      <th className="der">Stock</th>
                      <th>Término</th>
                      <th />
                    </tr>
                  </thead>
                  {filas.map((f, i) => (
                    <Fila
                      key={f.id}
                      f={f}
                      i={i}
                      saliendo={saliendo.has(f.id)}
                      catalogo={catalogo}
                      onCambio={(c) => editar(f.id, c)}
                      onQuitar={() => quitar(f.id)}
                    />
                  ))}
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <Paso n={3} icono={Send} titulo="Enviar a Precios FFVV" detalle={servidor.envio ? `Sale desde ${servidor.desde} con el Excel adjunto` : 'Copia el correo, pégalo en tu app de correo y adjunta el Excel'} />
            <div className="sobre">
              <Dato etiqueta="Para" valor={cfg.para} notificar={notificar} />
              {cfg.cc && <Dato etiqueta="CC" valor={cfg.cc} notificar={notificar} />}
              <Dato etiqueta="Asunto" valor={cfg.asunto} notificar={notificar} />
            </div>
            <div className="acciones">
              {servidor.envio && (
                <button className="primario grande" disabled={!listas} onClick={() => setConfirmando(true)}>
                  <Send size={17} /> Enviar correo
                </button>
              )}
              {!PUBLICADA && (
                <button className={servidor.envio ? '' : 'primario grande'} disabled={!listas} onClick={enviar}>
                  <Mail size={16} /> Copiar y abrir correo
                </button>
              )}
              <button className={PUBLICADA ? 'primario grande' : ''} disabled={!listas} onClick={soloCopiar}>
                <Copy size={16} /> {PUBLICADA ? 'Copiar correo' : 'Solo copiar'}
              </button>
              <button disabled={!listas} onClick={() => bajarExcel(filas, nombreExcel)}>
                <FileSpreadsheet size={16} /> Excel
              </button>
            </div>
            {filas.length > 0 && (
              <details className="vista">
                <summary>
                  <ChevronDown size={16} className="flecha" /> Vista previa del correo
                </summary>
                <div className="correo" dangerouslySetInnerHTML={{ __html: correoHTML(filas, cfg) }} />
              </details>
            )}
          </section>
        </main>
      )}

      {tab === 'historial' && (
        <Historial
          historial={historial}
          onReusar={(h) => {
            setFilas(h.filas.map((f) => ({ ...f, id: nuevoId(), termino: hoy() })))
            setTab('nueva')
          }}
          onBorrar={(id) => preguntar('¿Borrar del historial?', 'La solicitud ya enviada no se ve afectada.', () => setHistorial((hs) => hs.filter((h) => h.id !== id)), 'Borrar')}
          onExcel={bajarExcel}
        />
      )}

      {tab === 'catalogo' && <Catalogo catalogo={catalogo} setCatalogo={setCatalogo} notificar={notificar} preguntar={preguntar} />}

      {tab === 'ajustes' && (
        <main key="ajustes" className="vista-anim">
          <section className="card ajustes">
            <Paso icono={Mail} titulo="Correo" detalle="Cómo se arma el correo que se envía" />
            {[
              ['para', 'Para'],
              ['cc', 'CC (separar con coma)'],
              ['asunto', 'Asunto · {fecha} se reemplaza por la fecha de hoy'],
            ].map(([k, t]) => (
              <label key={k}>
                {t}
                <input value={ajustes[k]} onChange={(e) => setAjustes({ ...ajustes, [k]: e.target.value })} />
              </label>
            ))}
            <label>
              Saludo
              <textarea rows={2} value={ajustes.saludo} onChange={(e) => setAjustes({ ...ajustes, saludo: e.target.value })} />
            </label>
            <label>
              Despedida
              <textarea rows={2} value={ajustes.firma} onChange={(e) => setAjustes({ ...ajustes, firma: e.target.value })} />
            </label>
            <div className={`estado-envio ${servidor.envio ? 'activo' : ''}`}>
              {servidor.envio ? <CheckCircle2 size={18} /> : <Info size={18} />}
              {servidor.envio
                ? `Envío automático activo desde ${servidor.desde}`
                : PUBLICADA
                  ? 'Versión web: copia el correo y descarga el Excel. El envío automático funciona en el computador.'
                  : 'Envío automático desactivado: abre la app con "Abrir Precios FFVV.command"'}
            </div>
          </section>

          <section className="card ajustes">
            <Paso icono={PenLine} titulo="Firma" detalle="Aparece al final de cada correo. Deja vacío lo que no quieras mostrar" />
            <div className="dos">
              {[
                ['firmaNombre', 'Nombre', 'Tu nombre'],
                ['firmaCargo', 'Cargo o área', 'Frutas y Verduras'],
                ['firmaLocal', 'Local', 'Local Santa María'],
                ['firmaTelefono', 'Teléfono', '+56 9 ...'],
              ].map(([k, t, ph]) => (
                <label key={k}>
                  {t}
                  <input id={k} value={ajustes[k]} placeholder={ph} onChange={(e) => setAjustes({ ...ajustes, [k]: e.target.value })} />
                </label>
              ))}
            </div>
            <label>
              Correo
              <input id="firmaCorreo" value={ajustes.firmaCorreo} onChange={(e) => setAjustes({ ...ajustes, firmaCorreo: e.target.value })} />
            </label>
            <details className="vista" open>
              <summary>
                <ChevronDown size={16} className="flecha" /> Así se ve el correo
              </summary>
              <div
                className="correo"
                dangerouslySetInnerHTML={{
                  __html: correoHTML(
                    [
                      { codigo: '2542130000003', descripcion: 'MANZANA LIQUIDACION', precioActual: 999, precioSolicitado: 190, stock: 60, termino: hoy() },
                      { codigo: '2542120000006', descripcion: 'PERA LIQUIDACION', precioActual: 899, precioSolicitado: 190, stock: 50, termino: hoy() },
                    ],
                    cfg
                  ),
                }}
              />
            </details>
            <button className="fantasma" onClick={() => setAjustes(AJUSTES_BASE)}>
              <RotateCcw size={15} /> Restaurar valores por defecto
            </button>
          </section>
        </main>
      )}

      {pregunta && (
        <Modal onCerrar={() => setPregunta(null)}>
          <div className="modal-icono peligro">
            <Trash2 size={24} />
          </div>
          <h3>{pregunta.titulo}</h3>
          {pregunta.texto && <p className="modal-texto">{pregunta.texto}</p>}
          <div className="modal-acciones">
            <button onClick={() => setPregunta(null)}>Cancelar</button>
            <button
              className="primario rojo"
              onClick={() => {
                pregunta.accion()
                setPregunta(null)
              }}
            >
              {pregunta.boton}
            </button>
          </div>
        </Modal>
      )}

      {confirmando && (
        <Modal onCerrar={() => !enviando && setConfirmando(false)}>
          <div className="modal-icono">
            <Send size={24} />
          </div>
          <h3>¿Enviar la solicitud?</h3>
          <p className="modal-texto">
            Se enviará desde <b>{servidor.desde}</b> con la planilla Excel adjunta.
          </p>
          <div className="sobre compacto">
            <div>
              <span>Para</span>
              <b>{cfg.para}</b>
            </div>
            {cfg.cc && (
              <div>
                <span>CC</span>
                <b>{cfg.cc}</b>
              </div>
            )}
            <div>
              <span>Asunto</span>
              <b>{cfg.asunto}</b>
            </div>
          </div>
          <ul className="modal-lista">
            {filas.map((f) => (
              <li key={f.id}>
                <span>{f.descripcion}</span>
                <b>{pesos(f.precioSolicitado)}</b>
              </li>
            ))}
          </ul>
          <div className="modal-acciones">
            <button onClick={() => setConfirmando(false)} disabled={enviando}>
              Cancelar
            </button>
            <button className="primario" onClick={enviarDirecto} disabled={enviando}>
              {enviando ? (
                <>
                  <Loader2 size={16} className="gira" /> Enviando…
                </>
              ) : (
                <>
                  <Send size={16} /> Enviar ahora
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {enviado && (
        <Modal onCerrar={() => setEnviado(null)}>
          <div className="exito">
            <svg viewBox="0 0 52 52" className="check-anim" aria-hidden="true">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
          </div>
          <h3>¡Correo enviado!</h3>
          <p className="modal-texto">
            {enviado.n} producto{enviado.n > 1 ? 's' : ''} enviado{enviado.n > 1 ? 's' : ''} a <b>{enviado.para}</b>. Quedó guardado en el historial.
          </p>
          <div className="modal-acciones">
            <button className="primario" onClick={() => setEnviado(null)}>
              <Check size={16} /> Listo
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div key={toast.id} className={`toast ${toast.tipo}`}>
          {toast.tipo === 'ok' ? <CheckCircle2 size={18} /> : toast.tipo === 'error' ? <XCircle size={18} /> : <Info size={18} />}
          {toast.texto}
        </div>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor, notificar }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      notificar(`${etiqueta} copiado`, 'ok')
    } catch {
      notificar('No se pudo copiar; mantén presionado el texto para copiarlo', 'error')
    }
  }
  return (
    <div>
      <span>{etiqueta}</span>
      <b>{valor}</b>
      <button className="copiar" onClick={copiar} aria-label={`Copiar ${etiqueta}`} title="Copiar">
        <Copy size={14} />
      </button>
    </div>
  )
}

function Paso({ n, icono: Icono, titulo, detalle }) {
  return (
    <div className="paso">
      <div className="paso-icono">
        <Icono size={18} />
        {n && <span>{n}</span>}
      </div>
      <div>
        <h2>{titulo}</h2>
        {detalle && <p>{detalle}</p>}
      </div>
    </div>
  )
}

function Stat({ icono: Icono, valor, etiqueta, tono = '' }) {
  return (
    <div className={`stat ${tono}`}>
      <Icono size={16} />
      <b>{valor}</b>
      <span>{etiqueta}</span>
    </div>
  )
}

function Vacio({ icono: Icono, titulo, texto }) {
  return (
    <div className="vacio">
      <div className="vacio-icono">
        <Icono size={28} />
      </div>
      <b>{titulo}</b>
      <span>{texto}</span>
    </div>
  )
}

function Modal({ children, onCerrar }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])
  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

function Fila({ f, i, saliendo, catalogo, onCambio, onQuitar }) {
  const [abierto, setAbierto] = useState(false)
  const a = avisos(f)
  const d = descuento(f)
  const num = (k) => (e) => onCambio({ [k]: Number(e.target.value.replace(/\D/g, '')) || 0 })
  return (
    <tbody className={`grupo ${saliendo ? 'sale' : ''}`} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
      <tr className={!f.descripcion ? 'error' : a.length ? 'alerta' : ''}>
        <td>
          <input className="cod" value={f.codigo} onChange={(e) => onCambio({ codigo: e.target.value.replace(/\D/g, '') })} />
        </td>
        <td className="desc">
          <button className="producto" onClick={() => setAbierto(!abierto)} title="Cambiar producto">
            {f.descripcion || <i>Elegir producto…</i>} <ChevronDown size={15} />
          </button>
          {f.origen && (
            <div className="origen">
              <MessageSquareText size={12} /> {f.origen}
            </div>
          )}
          {abierto && (
            <Buscador
              catalogo={catalogo}
              inicial={f.busqueda || f.descripcion}
              onElegir={(p) => {
                onCambio({ codigo: p.codigo, descripcion: p.descripcion, precioActual: p.precioActual })
                setAbierto(false)
              }}
              onCerrar={() => setAbierto(false)}
            />
          )}
        </td>
        <td>
          <input className="num" value={f.precioActual} onChange={num('precioActual')} />
        </td>
        <td className="amarillo">
          <div className="precio-sol">
            <input className="num fuerte" value={f.precioSolicitado} onChange={num('precioSolicitado')} />
            {d > 0 && <span className="baja">−{d}%</span>}
          </div>
        </td>
        <td>
          <input className="num corto" value={f.stock} onChange={num('stock')} />
        </td>
        <td>
          <input className="fecha" value={f.termino} onChange={(e) => onCambio({ termino: e.target.value })} />
        </td>
        <td>
          <button className="x" onClick={onQuitar} title="Quitar" aria-label="Quitar">
            <Trash2 size={16} />
          </button>
        </td>
      </tr>
      {a.length > 0 && (
        <tr className="avisos">
          <td colSpan={7}>
            <AlertTriangle size={13} /> {a.join(' · ')}
          </td>
        </tr>
      )}
    </tbody>
  )
}

function Buscador({ catalogo, inicial = '', onElegir, onCerrar, placeholder = 'Buscar producto…' }) {
  const [q, setQ] = useState(inicial)
  const ref = useRef()
  useEffect(() => ref.current?.select(), [])
  const res = useMemo(() => (q.trim() ? buscarProducto(q, catalogo, 10).map((r) => r.producto) : catalogo.slice(0, 10)), [q, catalogo])
  return (
    <div className="buscador">
      <div className="buscador-input">
        <Search size={15} />
        <input
          ref={ref}
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setTimeout(() => onCerrar?.(), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCerrar?.()
            if (e.key === 'Enter' && res[0]) onElegir(res[0])
          }}
        />
      </div>
      <ul>
        {res.map((p, i) => (
          <li key={p.descripcion + i} onMouseDown={() => onElegir(p)}>
            <span>{p.descripcion}</span>
            <small>
              {p.codigo || 'sin código'} · {pesos(p.precioActual)}
            </small>
          </li>
        ))}
        {!res.length && <li className="nada">Sin resultados. Agrégalo en Catálogo.</li>}
      </ul>
    </div>
  )
}

function AgregarManual({ catalogo, onAgregar }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <span className="manual">
      <button onClick={() => setAbierto(!abierto)}>
        <Plus size={16} /> Agregar a mano
      </button>
      {abierto && (
        <Buscador
          catalogo={catalogo}
          onElegir={(p) => {
            onAgregar(p)
            setAbierto(false)
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </span>
  )
}

function Historial({ historial, onReusar, onBorrar, onExcel }) {
  if (!historial.length)
    return (
      <main key="historial" className="vista-anim">
        <section className="card">
          <Vacio icono={History} titulo="Sin solicitudes todavía" texto="Aquí quedarán las solicitudes que envíes o copies." />
        </section>
      </main>
    )
  return (
    <main key="historial" className="vista-anim">
      {historial.map((h, i) => (
        <section className="card historia" key={h.id} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
          <div className="titulo-fila">
            <div className="paso">
              <div className="paso-icono">
                <Mail size={18} />
              </div>
              <div>
                <h2>{fechaLarga(new Date(h.fecha))}</h2>
                <p>
                  {new Date(h.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {h.filas.length} producto{h.filas.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <span className="botones">
              <button onClick={() => onReusar(h)}>
                <RotateCcw size={15} /> Volver a usar
              </button>
              <button onClick={() => onExcel(h.filas, `Baja precios FFVV ${h.filas[0]?.termino ?? ''}.xlsx`)}>
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button className="x" onClick={() => onBorrar(h.id)} aria-label="Borrar">
                <Trash2 size={16} />
              </button>
            </span>
          </div>
          <div className="chips">
            {h.filas.map((f) => (
              <span key={f.id} className="chip">
                {f.descripcion} <b>{pesos(f.precioSolicitado)}</b>
              </span>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}

function Catalogo({ catalogo, setCatalogo, notificar, preguntar }) {
  const [q, setQ] = useState('')
  const archivo = useRef()
  const lista = useMemo(() => {
    const idx = catalogo.map((p, i) => ({ p, i }))
    if (!q.trim()) return idx
    const set = new Set(buscarProducto(q, catalogo, 50).map((r) => r.producto))
    return idx.filter(({ p }) => set.has(p))
  }, [q, catalogo])

  const editar = (i, c) => setCatalogo((cat) => cat.map((p, j) => (j === i ? { ...p, ...c } : p)))

  async function importar(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const prods = await importarCatalogo(file)
      if (!prods.length) return notificar('No encontré productos en ese Excel', 'error')
      preguntar(
        `¿Reemplazar el catálogo?`,
        `El Excel tiene ${prods.length} productos y reemplazará los ${catalogo.length} actuales.`,
        () => {
          setCatalogo(prods)
          notificar('Catálogo actualizado', 'ok')
        },
        'Reemplazar'
      )
    } catch {
      notificar('No se pudo leer el archivo', 'error')
    }
  }

  return (
    <main key="catalogo" className="vista-anim">
      <section className="card">
        <div className="titulo-fila">
          <div className="buscador-input filtro">
            <Search size={15} />
            <input placeholder="Buscar en catálogo…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="botones">
            <button onClick={() => setCatalogo((c) => [{ codigo: '', descripcion: 'NUEVO PRODUCTO', precioActual: 0, precioSolicitado: 0, stock: 0 }, ...c])}>
              <Plus size={15} /> Nuevo
            </button>
            <button onClick={() => archivo.current.click()}>
              <Upload size={15} /> Importar Excel
            </button>
            <button onClick={() => descargarCatalogo(catalogo).catch((e) => e?.code !== 'declined' && notificar('No se pudo descargar', 'error'))}>
              <FileSpreadsheet size={15} /> Exportar
            </button>
            <input ref={archivo} type="file" accept=".xlsx" hidden onChange={importar} />
          </span>
        </div>
        <p className="meta">
          <Info size={14} /> Los códigos y precios que corrijas en una solicitud se guardan aquí al enviar o copiar.
        </p>
        <div className="tabla-wrap">
          <table className="planilla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th className="der">Precio actual</th>
                <th className="der">Último solicitado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map(({ p, i }) => (
                <tr key={i} className={p.codigo === CODIGO_GENERICO || !p.codigo ? 'alerta' : ''}>
                  <td>
                    <input className="cod" value={p.codigo} onChange={(e) => editar(i, { codigo: e.target.value.replace(/\D/g, '') })} />
                  </td>
                  <td>
                    <input className="ancho" value={p.descripcion} onChange={(e) => editar(i, { descripcion: e.target.value.toUpperCase() })} />
                  </td>
                  <td>
                    <input className="num" value={p.precioActual} onChange={(e) => editar(i, { precioActual: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                  </td>
                  <td className="gris der">{pesos(p.precioSolicitado)}</td>
                  <td>
                    <button className="x" onClick={() => preguntar(`¿Eliminar ${p.descripcion}?`, 'Se quitará del catálogo.', () => setCatalogo((c) => c.filter((_, j) => j !== i)))} aria-label="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
