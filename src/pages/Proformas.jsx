import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import DatePickerInput from '../components/DatePickerInput'
import { api } from '../lib/apiClient'

export default function Proformas() {
  const { token } = useAuthStore()
  const [proformas, setProformas] = useState([])
  const [motos, setMotos] = useState([])
  const [accesorios, setAccesorios] = useState([])
  const [repuestos, setRepuestos] = useState([])
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState({ nombre: '', ci_nit: '', celular: '' })
  const [itemForm, setItemForm] = useState({ tipo: 'moto', producto_id: '', cantidad: 1, descuento_pct: 0 })
  const [fechaLimite, setFechaLimite] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [printLoading, setPrintLoading] = useState(false)

  const load = async () => {
    const [p, m, a, r] = await Promise.all([
      api.listarProformas({ token }),
      api.listarMotos({ token }),
      api.listarAccesorios({ token }),
      api.listarRepuestos({ token }),
    ])
    if (p.ok) setProformas(p.data)
    if (m.ok) setMotos(m.data)
    if (a.ok) setAccesorios(a.data)
    if (r.ok) setRepuestos(r.data)
  }

  useEffect(() => { load() }, [])

  const productoLabel = (tipo, id) => {
    if (!id) return ''
    if (tipo === 'moto') {
      const p = motos.find(m => m.id === id)
      return p ? `${p.marca} ${p.ano ?? p.modelo}`.trim() : ''
    }
    if (tipo === 'accesorio') {
      const p = accesorios.find(a => a.id === id)
      return p ? `${p.marca ? p.marca + ' ' : ''}${p.tipo}`.trim() : ''
    }
    const p = repuestos.find(r => r.id === id)
    return p ? `${p.marca ? p.marca + ' ' : ''}${p.tipo}`.trim() : ''
  }

  const getProducto = (tipo, id) => {
    if (!id) return null
    if (tipo === 'moto') return motos.find(m => m.id === id) || null
    if (tipo === 'accesorio') return accesorios.find(a => a.id === id) || null
    return repuestos.find(r => r.id === id) || null
  }

  const addItem = () => {
    if (!itemForm.producto_id) return toast.error('Selecciona un producto')
    const productoId = Number(itemForm.producto_id)
    const producto = getProducto(itemForm.tipo, productoId)
    const payload = {
      cantidad: Number(itemForm.cantidad || 1),
      descuento_pct: Number(itemForm.descuento_pct || 0),
      descripcion: productoLabel(itemForm.tipo, productoId),
      _descuento_maximo: producto?.descuento_maximo_pct ?? null,
      _edit: false,
    }
    if (itemForm.tipo === 'moto') payload.moto_id = productoId
    if (itemForm.tipo === 'accesorio') payload.accesorio_id = productoId
    if (itemForm.tipo === 'repuesto') payload.repuesto_id = productoId

    setItems(prev => [...prev, payload])
    setItemForm({ ...itemForm, producto_id: '' })
  }

  const crearProforma = async () => {
    if (!cliente.nombre || !cliente.ci_nit || !cliente.celular) return toast.error('Completa datos del cliente')
    if (items.length === 0) return toast.error('Agrega al menos un ítem')

    const res = await api.crearProforma({
      token,
      data: {
        cliente_nombre: cliente.nombre,
        cliente_ci_nit: cliente.ci_nit,
        cliente_celular: cliente.celular,
        fecha_limite: fechaLimite || null,
        items,
      }
    })
    if (!res.ok) return toast.error(res.error || 'Error')

    toast.success('Proforma creada')
    setItems([])
    setCliente({ nombre: '', ci_nit: '', celular: '' })
    setFechaLimite('')
    load()
  }

  const cancelar = async (id) => {
    const res = await api.cancelarProforma({ token, id })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Proforma cancelada')
    load()
  }

  const verProforma = async (id) => {
    setDetalleLoading(true)
    try {
      const res = await api.obtenerProforma({ token, id })
      if (!res.ok) return toast.error(res.error || 'Error')
      setDetalle(res.data)
    } finally {
      setDetalleLoading(false)
    }
  }

  const imprimirProforma = async (id) => {
    if (!id) return toast.error('Proforma inválida')
    setPrintLoading(true)
    try {
      const res = await api.exportarProformaArchivo({ token, id })
      if (!res.ok) return toast.error(res.error || 'No se pudo exportar el archivo')
      toast.success(`Archivo generado: ${res.path}`)
    } finally {
      setPrintLoading(false)
    }
  }

  const toggleEditItem = (idx) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, _edit: !it._edit } : it))
  }

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th: { textAlign: 'left', borderBottom: '1px solid var(--divider)', padding: '6px 4px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)' },
    td: { borderBottom: '1px solid var(--divider)', padding: '6px 4px', color: 'var(--text-dim)' },
  }

  const productos = itemForm.tipo === 'moto' ? motos : itemForm.tipo === 'accesorio' ? accesorios : repuestos

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>PROFORMAS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Crear y gestionar</h1>
      </div>

      <div className="grid-main-two">
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Crear proforma</div>
          <div className="grid-four">
            <div>
              <div style={S.label}>Cliente</div>
              <input style={S.input} value={cliente.nombre} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>CI / NIT</div>
              <input style={S.input} value={cliente.ci_nit} onChange={e => setCliente(c => ({ ...c, ci_nit: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Celular</div>
              <input style={S.input} value={cliente.celular} onChange={e => setCliente(c => ({ ...c, celular: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Fecha limite</div>
              <DatePickerInput
                value={fechaLimite}
                onChange={setFechaLimite}
                placeholder="YYYY-MM-DD"
                inputStyle={S.input}
              />
            </div>
          </div>

          <div className="grid-four" style={{ marginTop: 12 }}>
            <div>
              <div style={S.label}>Tipo</div>
              <select style={S.input} value={itemForm.tipo} onChange={e => setItemForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="moto">Moto</option>
                <option value="accesorio">Accesorio</option>
                <option value="repuesto">Repuesto</option>
              </select>
            </div>
            <div>
              <div style={S.label}>Producto</div>
              <select style={S.input} value={itemForm.producto_id} onChange={e => setItemForm(f => ({ ...f, producto_id: e.target.value }))}>
                <option value="">Selecciona</option>
                {productos.map(p => (
                  <option key={p.id} value={p.id}>
                    {itemForm.tipo === 'moto' ? `${p.marca} ${p.ano ?? p.modelo}` : `${p.tipo} ${p.marca ? '· ' + p.marca : ''}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={S.label}>Cantidad</div>
              <input style={S.input} type="number" value={itemForm.cantidad} onChange={e => setItemForm(f => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Desc %</div>
              <input
                style={S.input}
                type="number"
                min="0"
                max={getProducto(itemForm.tipo, Number(itemForm.producto_id))?.descuento_maximo_pct ?? undefined}
                value={itemForm.descuento_pct}
                onChange={e => setItemForm(f => ({ ...f, descuento_pct: e.target.value }))} />
            </div>
          </div>

          <div className="button-row" style={{ marginTop: 10 }}>
            <button onClick={addItem} style={S.btn}>Agregar ítem</button>
            <button onClick={crearProforma} style={S.btn}>Guardar proforma</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>Ítems</div>
            {items.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>Sin ítems</div> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--divider)', borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-strong)' }}>{it.descripcion || 'Sin descripcion'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Cantidad {it.cantidad} · Desc {it.descuento_pct}%</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button onClick={() => toggleEditItem(idx)} style={S.btn}>{it._edit ? 'Cerrar' : 'Editar'}</button>
                      <button onClick={() => removeItem(idx)} style={S.btn}>Quitar</button>
                    </div>
                    {it._edit && (
                      <div className="grid-three" style={{ gap: 8, marginTop: 8 }}>
                        <div>
                          <div style={S.label}>Descripcion</div>
                          <input style={S.input} value={it.descripcion || ''} onChange={e => updateItem(idx, { descripcion: e.target.value })} />
                        </div>
                        <div>
                          <div style={S.label}>Cantidad</div>
                          <input style={S.input} type="number" value={it.cantidad} onChange={e => updateItem(idx, { cantidad: Number(e.target.value || 1) })} />
                        </div>
                        <div>
                          <div style={S.label}>Desc %</div>
                          <input
                            style={S.input}
                            type="number"
                            min="0"
                            max={it._descuento_maximo ?? undefined}
                            value={it.descuento_pct}
                            onChange={e => updateItem(idx, { descuento_pct: Number(e.target.value || 0) })} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Proformas recientes</div>
          <div className="list-scroll">
            {proformas.map(p => (
              <div key={p.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>{p.codigo} · {p.cliente_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{p.estado} · Total {p.total}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={() => verProforma(p.id)} style={S.btn}>Ver</button>
                  {p.estado === 'ACTIVA' && (
                    <button onClick={() => cancelar(p.id)} style={S.btn}>Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>Detalle</div>
            {detalleLoading && <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>}
            {!detalleLoading && !detalle && <div style={{ color: 'var(--text-muted)' }}>Selecciona una proforma</div>}
            {!detalleLoading && detalle && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                <div className="grid-two-tight" style={{ alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 1 }}>PROFORMA</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>N° {detalle.codigo}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-soft)' }}>Vendedor: {detalle.vendedor_nombre}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>Moto System</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Creada: {detalle.fecha_creacion}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Vigente hasta: {detalle.fecha_expiracion}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Estado: {detalle.estado}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--divider)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Cliente</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-strong)' }}>{detalle.cliente_nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{detalle.cliente_ci_nit} · {detalle.cliente_celular}</div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="table-wrap">
                    <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Descripcion</th>
                        <th style={S.th}>Año</th>
                        <th style={S.th}>Tipo</th>
                        <th style={S.th}>Color</th>
                        <th style={S.th}>Cilindrada</th>
                        <th style={S.th}>Motor</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Precio</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Cant</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Desc %</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items?.map(it => (
                        <tr key={it.id}>
                          <td style={S.td}>{it.descripcion}</td>
                          <td style={S.td}>{it.modelo || '-'}</td>
                          <td style={S.td}>{it.tipo || '-'}</td>
                          <td style={S.td}>{it.color || '-'}</td>
                          <td style={S.td}>{it.cilindrada || '-'}</td>
                          <td style={S.td}>{it.motor || '-'}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{Number(it.precio_unitario_final).toFixed(2)}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{Number(it.descuento_pct).toFixed(2)}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{Number(it.subtotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-soft)' }}>
                      <span>Subtotal</span>
                      <span>{Number(detalle.subtotal).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-soft)' }}>
                      <span>Descuentos</span>
                      <span>{Number(detalle.total_descuentos).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginTop: 4, color: 'var(--text-strong)' }}>
                      <span>Total</span>
                      <span>{Number(detalle.total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <button onClick={() => imprimirProforma(detalle.id)} disabled={printLoading} style={{ ...S.btn, marginTop: 10, opacity: printLoading ? 0.7 : 1 }}>
                  {printLoading ? 'Generando...' : 'Exportar archivo'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
