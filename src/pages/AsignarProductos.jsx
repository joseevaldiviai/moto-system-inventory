import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'
import { api } from '../lib/apiClient'

const PRODUCT_TABS = [
  { id: 'motos', label: 'Motos' },
  { id: 'motos_e', label: 'Motos-E' },
  { id: 'accesorios', label: 'Accesorios' },
  { id: 'repuestos', label: 'Repuestos' },
]

export default function AsignarProductos() {
  const { token } = useAuthStore()
  const [puntos, setPuntos] = useState([])
  const [tab, setTab] = useState('motos')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [tickets, setTickets] = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(false)

  const [form, setForm] = useState({
    origen_punto_venta_id: '',
    destino_punto_venta_id: '',
    items: [],
  })
  const [lastCode, setLastCode] = useState('')

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
    btnPrimary: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-contrast)', cursor: 'pointer', fontSize: 12 },
  }

  useEffect(() => {
    if (!token) return
    api.listarPuntosVenta({ token }).then((res) => {
      if (!res.ok) return
      setPuntos(res.data)
      const central = res.data.find((p) => p.tipo === 'CENTRAL')
      const firstPos = res.data.find((p) => p.tipo !== 'CENTRAL' && p.activo)
      setForm((f) => ({
        ...f,
        origen_punto_venta_id: f.origen_punto_venta_id || (central ? String(central.id) : ''),
        destino_punto_venta_id: f.destino_punto_venta_id || (firstPos ? String(firstPos.id) : ''),
      }))
    })
  }, [token])

  const originId = form.origen_punto_venta_id ? Number(form.origen_punto_venta_id) : null
  const destinationId = form.destino_punto_venta_id ? Number(form.destino_punto_venta_id) : null
  const originPoint = useMemo(() => puntos.find((p) => Number(p.id) === originId) || null, [puntos, originId])
  const destinationPoint = useMemo(() => puntos.find((p) => Number(p.id) === destinationId) || null, [puntos, destinationId])

  const inventoryScope = useMemo(() => {
    if (!originPoint) return null
    if (originPoint.tipo === 'CENTRAL') return { scope: 'central' }
    return { scope: 'point', puntoVentaId: originPoint.id }
  }, [originPoint])

  const loadTickets = async () => {
    if (!token) return
    setTicketsLoading(true)
    try {
      const res = await api.listarAsignacionesProductos({ token, limit: 80 })
      if (!res?.ok) return
      setTickets(res.data || [])
    } finally {
      setTicketsLoading(false)
    }
  }

  const fetchByTab = async (currentTab, params = {}) => {
    if (currentTab === 'motos') return api.listarMotos({ token, ...params })
    if (currentTab === 'motos_e') return api.listarMotosE({ token, ...params })
    if (currentTab === 'accesorios') return api.listarAccesorios({ token, ...params })
    if (currentTab === 'repuestos') return api.listarRepuestos({ token, ...params })
    return { ok: false, error: 'Tab no soportada' }
  }

  const load = async () => {
    if (!token) return
    if (!inventoryScope) return
    setLoading(true)
    try {
      const res = await fetchByTab(tab, {
        ...(search.trim() ? { buscar: search.trim() } : {}),
        ...(inventoryScope.scope === 'central' ? { scope: 'central' } : { scope: 'point', puntoVentaId: inventoryScope.puntoVentaId }),
      })
      if (!res.ok) return setResults([])
      setResults(res.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token, tab, search, inventoryScope?.scope, inventoryScope?.puntoVentaId])
  useEffect(() => { loadTickets() }, [token])

  const formatTicketDate = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString('es-BO')
  }

  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`

  const buildProductLabel = (product) => {
    const parts = [
      product?.marca,
      product?.tipo || product?.ano,
      product?.ano && product?.tipo ? product?.ano : null,
      product?.color,
      product?.cilindrada,
    ].filter(Boolean)
    return parts.join(' · ') || `#${product?.id}`
  }

  const openPrint = (assignment) => {
    const items = assignment?.items || []
    const rowsHtml = items.map((it) => `
      <tr>
        <td>${it.producto_tipo ?? ''}</td>
        <td>${it.marca ?? ''}</td>
        <td>${it.tipo ?? ''}</td>
        <td>${it.ano ?? ''}</td>
        <td>${it.color ?? ''}</td>
        <td>${it.cilindrada ?? ''}</td>
        <td style="text-align:right">${Number(it.cantidad ?? 0)}</td>
        <td style="text-align:right">${Number(it.precio_venta ?? 0).toFixed(2)}</td>
        <td style="text-align:right">${Number(it.subtotal ?? 0).toFixed(2)}</td>
      </tr>
    `).join('')

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${assignment.codigo}</title>
  <style>
    body { font-family: Georgia, serif; margin: 28px; color: #0f172a; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    .meta { color: #475569; font-size: 12px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
    th { background: #f8fafc; }
    .totals { margin-top: 12px; font-size: 12px; color: #334155; }
    @media print { button { display: none; } body { margin: 0.8cm; } }
  </style>
</head>
<body>
  <button onclick="window.print()" style="margin-bottom:12px">Imprimir / Guardar como PDF</button>
  <h1>Ticket de consolidación</h1>
  <div class="meta"><b>Código:</b> ${assignment.codigo}</div>
  <div class="meta"><b>Estado:</b> ${assignment.estado}</div>
  <div class="meta"><b>Origen:</b> ${assignment.origen_nombre}</div>
  <div class="meta"><b>Destino:</b> ${assignment.destino_nombre}</div>
  <div class="meta"><b>Creado:</b> ${assignment.creado_en ? new Date(assignment.creado_en).toLocaleString('es-BO') : '-'}</div>
  <div class="meta"><b>Aplicado:</b> ${assignment.aplicado_en ? new Date(assignment.aplicado_en).toLocaleString('es-BO') : '-'}</div>

  <table>
    <thead>
      <tr>
        <th>Tipo</th><th>Marca</th><th>Modelo/Tipo</th><th>Año</th><th>Color</th><th>Cilindrada</th>
        <th style="text-align:right">Cantidad</th>
        <th style="text-align:right">Precio venta</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div><b>Total unidades:</b> ${Number(assignment.total_unidades ?? 0)}</div>
    <div><b>Total (precio venta):</b> ${Number(assignment.total_venta ?? 0).toFixed(2)}</div>
  </div>
</body>
</html>`

    const w = window.open('', '_blank')
    if (!w) return toast.error('Permite ventanas emergentes para imprimir')
    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.focus(), 50)
  }

  const addItem = (product) => {
    const key = `${tab}:${product.id}`
    const existing = form.items.find((it) => it.key === key)
    if (existing) {
      setForm((f) => ({
        ...f,
        items: f.items.map((it) => it.key === key ? { ...it, cantidad: String(Number(it.cantidad || 1) + 1) } : it),
      }))
      return
    }
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          key,
          kind: tab,
          product_id: product.id,
          nombre: buildProductLabel(product),
          disponible: Number(product.cantidad_libre || 0),
          cantidad: '1',
        },
      ],
    }))
  }

  const removeItem = (key) => setForm((f) => ({ ...f, items: f.items.filter((it) => it.key !== key) }))

  const updateQty = (key, value) => setForm((f) => ({
    ...f,
    items: f.items.map((it) => it.key === key ? { ...it, cantidad: value } : it),
  }))

  const submit = async () => {
    if (!originId || !destinationId) return toast.error('Selecciona origen y destino')
    if (originId === destinationId) return toast.error('Origen y destino no pueden ser iguales')
    if (!form.items.length) return toast.error('Agrega al menos un item')

    const payloadItems = form.items.map((it) => ({
      kind: it.kind,
      product_id: Number(it.product_id),
      cantidad: Number(it.cantidad),
    }))

    if (payloadItems.some((it) => !Number.isFinite(it.cantidad) || it.cantidad <= 0)) {
      return toast.error('Cantidad inválida en items')
    }

    const res = await api.crearAsignacionProductos({
      token,
      data: {
        origen_punto_venta_id: originId,
        destino_punto_venta_id: destinationId,
        items: payloadItems,
      },
    })
    if (!res?.ok) return toast.error(res?.error || 'No se pudo crear la asignación')
    setLastCode(res.data.codigo)
    toast.success(`Asignación creada: ${res.data.codigo}`)
    setForm((f) => ({ ...f, items: [] }))
    loadTickets()
  }

  const originOptions = puntos.filter((p) => p.activo)
  const destinationOptions = puntos.filter((p) => p.activo)

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>ASIGNAR PRODUCTOS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Consolidación</h1>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          Genera un código de asignación para mover inventario entre almacén y punto de venta (o viceversa).
        </div>
      </div>

      {lastCode && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            Código generado
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 16, color: 'var(--text-strong)' }}>{lastCode}</div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(lastCode)
                  toast.success('Copiado')
                } catch {
                  toast.error('No se pudo copiar')
                }
              }}
              style={S.btn}
            >
              Copiar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={S.card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 2 }}>Tickets de consolidación</div>
              <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Listado de códigos generados (últimos {tickets?.length || 0}).</div>
            </div>
            <button type="button" onClick={loadTickets} style={S.btn} disabled={ticketsLoading}>
              {ticketsLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          <div style={{ marginTop: 12 }} className="table-wrap list-scroll">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Código</th>
                  <th style={{ padding: '6px 4px' }}>Origen</th>
                  <th style={{ padding: '6px 4px' }}>Destino</th>
                  <th style={{ padding: '6px 4px' }}>Items</th>
                  <th style={{ padding: '6px 4px' }}>Estado</th>
                  <th style={{ padding: '6px 4px' }}>Creado</th>
                  <th style={{ padding: '6px 4px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(tickets || []).map((t) => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--divider)' }}>
                    <td style={{ padding: '6px 4px', fontFamily: 'monospace', color: 'var(--text-strong)' }}>{t.codigo}</td>
                    <td style={{ padding: '6px 4px' }}>{t.origen_nombre}</td>
                    <td style={{ padding: '6px 4px' }}>{t.destino_nombre}</td>
                    <td style={{ padding: '6px 4px' }}>{t.total_items ?? 0}</td>
                    <td style={{ padding: '6px 4px' }}>{t.estado}</td>
                    <td style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>{formatTicketDate(t.creado_en)}</td>
                    <td style={{ padding: '6px 4px', minWidth: 180 }}>
                      <div className="button-row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          style={S.btn}
                          onClick={async () => {
                            const res = await api.obtenerAsignacionProductos({ token, codigo: t.codigo })
                            if (!res?.ok) return toast.error(res?.error || 'No se pudo imprimir el ticket')
                            openPrint(res.data)
                          }}
                        >
                          Imprimir
                        </button>
                        <button
                          type="button"
                          style={S.btn}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(t.codigo)
                              toast.success('Copiado')
                            } catch {
                              toast.error('No se pudo copiar')
                            }
                          }}
                        >
                          Copiar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(tickets || []).length === 0 && !ticketsLoading && (
                  <tr>
                    <td colSpan={7} style={{ padding: '10px 4px', color: 'var(--text-muted)' }}>
                      Sin tickets aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid-main-two">
        <div className="stack-md">
          <div style={S.card}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Origen y destino</div>
            <div className="grid-two-tight">
              <div>
                <div style={S.label}>Origen</div>
                <select
                  style={S.input}
                  value={form.origen_punto_venta_id}
                  onChange={(e) => setForm((f) => ({ ...f, origen_punto_venta_id: e.target.value }))}
                >
                  <option value="">Selecciona origen</option>
                  {originOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.tipo === 'CENTRAL' ? 'Almacen Central' : p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={S.label}>Destino</div>
                <select
                  style={S.input}
                  value={form.destino_punto_venta_id}
                  onChange={(e) => setForm((f) => ({ ...f, destino_punto_venta_id: e.target.value }))}
                >
                  <option value="">Selecciona destino</option>
                  {destinationOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.tipo === 'CENTRAL' ? 'Almacen Central' : p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            {originPoint && destinationPoint && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-soft)' }}>
                {originPoint.tipo === 'CENTRAL' ? '🏬 Almacén Central' : `🏪 ${originPoint.nombre}`} →{' '}
                {destinationPoint.tipo === 'CENTRAL' ? '🏬 Almacén Central' : `🏪 ${destinationPoint.nombre}`}
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Items</div>
            {form.items.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Aún no agregaste items. Busca productos a la derecha y presiona “Agregar”.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {form.items.map((it) => (
                  <div key={it.key} style={{ borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 220 }}>
                        <div style={{ color: 'var(--text-strong)' }}>{it.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Tipo: {it.kind} · Disponible (origen): {it.disponible}
                        </div>
                      </div>
                      <div className="button-row" style={{ gap: 8 }}>
                        <input
                          style={{ ...S.input, width: 120 }}
                          type="number"
                          min="1"
                          max={it.disponible || undefined}
                          value={it.cantidad}
                          onChange={(e) => updateQty(it.key, e.target.value)}
                        />
                        <button type="button" onClick={() => removeItem(it.key)} style={S.btn}>Quitar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="button-row" style={{ marginTop: 12 }}>
              <button type="button" onClick={submit} style={S.btnPrimary}>
                Generar código
              </button>
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Buscar productos (en origen)</div>
          <div className="button-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {PRODUCT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  ...S.btn,
                  background: tab === t.id ? 'var(--accent)' : 'transparent',
                  color: tab === t.id ? 'var(--accent-contrast)' : 'var(--text-dim)',
                  borderColor: tab === t.id ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              style={S.input}
              placeholder="Buscar producto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!originPoint ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Selecciona un origen para buscar stock.</div>
          ) : loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>
          ) : (
            <div className="list-scroll" style={{ maxHeight: 520 }}>
              {(results || []).map((p) => (
                <div key={p.id} style={{ borderTop: '1px solid var(--divider)', padding: '10px 0', fontSize: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ color: 'var(--text-strong)' }}>
                        {buildProductLabel(p)}
                      </div>
                      <div style={{ color: 'var(--text-soft)' }}>
                        Stock: {Number(p.cantidad_libre || 0)}
                        {p.ano ? ` · Año: ${p.ano}` : ''}
                        {p.color ? ` · Color: ${p.color}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => addItem(p)} style={S.btn} disabled={Number(p.cantidad_libre || 0) <= 0}>
                      Agregar
                    </button>
                  </div>
                </div>
              ))}
              {(results || []).length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin resultados.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

