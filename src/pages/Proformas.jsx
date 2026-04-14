import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import DatePickerInput from '../components/DatePickerInput'
import { api } from '../lib/apiClient'

const INITIAL_ITEM_FORM = {
  producto: 'moto',
  marca: '',
  producto_id: '',
  cantidad: 1,
  descuento_pct: 0,
}

export default function Proformas() {
  const { token, usuario, esSupervisor } = useAuthStore()
  const [proformas, setProformas] = useState([])
  const [motos, setMotos] = useState([])
  const [motosE, setMotosE] = useState([])
  const [accesorios, setAccesorios] = useState([])
  const [repuestos, setRepuestos] = useState([])
  const [marcas, setMarcas] = useState([])
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState({ nombre: '', ci_nit: '', celular: '' })
  const [itemForm, setItemForm] = useState(INITIAL_ITEM_FORM)
  const [fechaLimite, setFechaLimite] = useState('')
  const [filtroProformas, setFiltroProformas] = useState({ fecha: '', numero: '' })
  const [detalle, setDetalle] = useState(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [printLoading, setPrintLoading] = useState(false)

  const inventoryParams = esSupervisor()
    ? { scope: 'central' }
    : usuario?.punto_venta_id
      ? { scope: 'point', puntoVentaId: usuario.punto_venta_id }
      : null
  const canOperate = esSupervisor() || !!usuario?.punto_venta_id

  const loadCatalogos = async () => {
    if (!inventoryParams) {
      setMotos([])
      setMotosE([])
      setAccesorios([])
      setRepuestos([])
      return
    }
    const [m, me, a, r, marcasRes] = await Promise.all([
      api.listarMotos({ token, soloStock: true, ...inventoryParams }),
      api.listarMotosE({ token, soloStock: true, ...inventoryParams }),
      api.listarAccesorios({ token, soloStock: true, ...inventoryParams }),
      api.listarRepuestos({ token, soloStock: true, ...inventoryParams }),
      api.listarMarcas({ token }),
    ])
    if (m.ok) setMotos(m.data)
    if (me.ok) setMotosE(me.data)
    if (a.ok) setAccesorios(a.data)
    if (r.ok) setRepuestos(r.data)
    if (marcasRes.ok) setMarcas(marcasRes.data.filter((marca) => marca.activo))
  }

  const loadProformas = async (filters = filtroProformas) => {
    const p = await api.listarProformas({
      token,
      fecha: filters.fecha || undefined,
      numero: filters.numero || undefined,
    })
    if (p.ok) setProformas(p.data)
  }

  const load = async () => {
    if (!inventoryParams) {
      setMotos([])
      setMotosE([])
      setAccesorios([])
      setRepuestos([])
    }
    const [p, m, me, a, r, marcasRes] = await Promise.all([
      api.listarProformas({
        token,
        fecha: filtroProformas.fecha || undefined,
        numero: filtroProformas.numero || undefined,
      }),
      inventoryParams ? api.listarMotos({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      inventoryParams ? api.listarMotosE({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      inventoryParams ? api.listarAccesorios({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      inventoryParams ? api.listarRepuestos({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      api.listarMarcas({ token }),
    ])
    if (p.ok) setProformas(p.data)
    if (m.ok) setMotos(m.data)
    if (me.ok) setMotosE(me.data)
    if (a.ok) setAccesorios(a.data)
    if (r.ok) setRepuestos(r.data)
    if (marcasRes.ok) setMarcas(marcasRes.data.filter((marca) => marca.activo))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!token) return
    loadProformas()
  }, [token, filtroProformas.fecha, filtroProformas.numero])

  const productoLabel = (producto, id) => {
    if (!id) return ''
    if (producto === 'moto') {
      const p = motos.find(m => m.id === id)
      return p ? `${p.marca} ${p.ano ?? p.modelo}`.trim() : ''
    }
    if (producto === 'moto_e') {
      const p = motosE.find(m => m.id === id)
      return p ? `${p.marca} ${p.ano ?? p.modelo}`.trim() : ''
    }
    if (producto === 'accesorio') {
      const p = accesorios.find(a => a.id === id)
      return p ? `${p.marca ? p.marca + ' ' : ''}${p.tipo}`.trim() : ''
    }
    const p = repuestos.find(r => r.id === id)
    return p ? `${p.marca ? p.marca + ' ' : ''}${p.tipo}`.trim() : ''
  }

  const getProducto = (producto, id) => {
    if (!id) return null
    if (producto === 'moto') return motos.find(m => m.id === id) || null
    if (producto === 'moto_e') return motosE.find(m => m.id === id) || null
    if (producto === 'accesorio') return accesorios.find(a => a.id === id) || null
    return repuestos.find(r => r.id === id) || null
  }

  const catalogoActual = itemForm.producto === 'moto'
    ? motos
    : itemForm.producto === 'moto_e'
      ? motosE
    : itemForm.producto === 'accesorio'
      ? accesorios
      : repuestos

  const marcasDisponibles = marcas.map((marca) => marca.nombre).sort((a, b) => a.localeCompare(b))
  const productosFiltrados = itemForm.marca
    ? catalogoActual.filter((p) => p.marca === itemForm.marca)
    : []

  const formatProductoOption = (producto) => {
    if (itemForm.producto === 'moto' || itemForm.producto === 'moto_e') return `${producto.marca} ${producto.ano ?? producto.modelo} · ${producto.chasis}`
    return `${producto.tipo}${producto.marca ? ` · ${producto.marca}` : ''}${producto.color ? ` · ${producto.color}` : ''}`
  }

  const addItem = () => {
    if (!itemForm.producto_id) return toast.error('Selecciona un producto')
    const productoId = Number(itemForm.producto_id)
    const producto = getProducto(itemForm.producto, productoId)
    const payload = {
      cantidad: Number(itemForm.cantidad || 1),
      descuento_pct: Number(itemForm.descuento_pct || 0),
      descripcion: productoLabel(itemForm.producto, productoId),
      _descuento_maximo: producto?.descuento_maximo_pct ?? null,
      _edit: false,
    }
    if (itemForm.producto === 'moto') payload.moto_id = productoId
    if (itemForm.producto === 'moto_e') payload.moto_e_id = productoId
    if (itemForm.producto === 'accesorio') payload.accesorio_id = productoId
    if (itemForm.producto === 'repuesto') payload.repuesto_id = productoId

    setItems(prev => [...prev, payload])
    setItemForm((current) => ({ ...current, producto_id: '', cantidad: 1, descuento_pct: 0 }))
  }

  const crearProforma = async () => {
    if (!canOperate) return toast.error('Asigna un punto de venta al vendedor antes de crear proformas')
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
    loadProformas()
    loadCatalogos()
  }

  const cancelar = async (id) => {
    const res = await api.cancelarProforma({ token, id })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Proforma cancelada')
    loadProformas()
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

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>PROFORMAS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Crear y gestionar</h1>
        {usuario?.punto_venta_nombre && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
            Stock de trabajo: {usuario.punto_venta_tipo === 'CENTRAL' ? 'Almacen central' : usuario.punto_venta_nombre}
          </div>
        )}
      </div>

      {!canOperate && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
          Este vendedor no tiene punto de venta asignado. Un administrador debe asignarlo antes de cotizar.
        </div>
      )}

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
              <div style={S.label}>Tipo producto</div>
              <select
                style={S.input}
                value={itemForm.producto}
                onChange={e => setItemForm({ ...INITIAL_ITEM_FORM, producto: e.target.value })}
              >
                <option value="moto">Moto</option>
                <option value="moto_e">Moto-E</option>
                <option value="accesorio">Accesorio</option>
                <option value="repuesto">Repuesto</option>
              </select>
            </div>
            <div>
              <div style={S.label}>Marca</div>
              <select
                style={S.input}
                value={itemForm.marca}
                onChange={e => setItemForm(f => ({ ...f, marca: e.target.value, producto_id: '' }))}
              >
                <option value="">Elegir marca</option>
                {marcasDisponibles.map((marca) => (
                  <option key={marca} value={marca}>{marca}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={S.label}>Producto</div>
              <select
                style={S.input}
                disabled={!itemForm.marca}
                value={itemForm.producto_id}
                onChange={e => setItemForm(f => ({ ...f, producto_id: e.target.value }))}
              >
                <option value="">{itemForm.marca ? 'Selecciona producto' : 'Primero elige marca'}</option>
                {productosFiltrados.map((producto) => (
                  <option key={producto.id} value={producto.id}>{formatProductoOption(producto)}</option>
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
                max={getProducto(itemForm.producto, Number(itemForm.producto_id))?.descuento_maximo_pct ?? undefined}
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
          <div className="grid-two-tight" style={{ marginBottom: 10 }}>
            <div>
              <div style={S.label}>Número</div>
              <input
                style={S.input}
                placeholder="PRO-2026-0001"
                value={filtroProformas.numero}
                onChange={e => setFiltroProformas(f => ({ ...f, numero: e.target.value }))}
              />
            </div>
            <div>
              <div style={S.label}>Fecha</div>
              <DatePickerInput
                value={filtroProformas.fecha}
                onChange={(value) => setFiltroProformas(f => ({ ...f, fecha: value }))}
                placeholder="YYYY-MM-DD"
                inputStyle={S.input}
              />
            </div>
          </div>
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
            {proformas.length === 0 && (
              <div style={{ color: 'var(--text-muted)', paddingTop: 8 }}>No hay proformas que coincidan con la búsqueda</div>
            )}
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
