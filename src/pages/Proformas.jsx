import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function Proformas() {
  const { token } = useAuthStore()
  const [proformas, setProformas] = useState([])
  const [motos, setMotos] = useState([])
  const [accesorios, setAccesorios] = useState([])
  const [repuestos, setRepuestos] = useState([])
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState({ nombre: '', ci_nit: '', celular: '' })
  const [itemForm, setItemForm] = useState({ tipo: 'moto', producto_id: '', cantidad: 1, descuento_pct: 0 })

  const load = async () => {
    const [p, m, a, r] = await Promise.all([
      window.api.listarProformas({ token }),
      window.api.listarMotos({ token }),
      window.api.listarAccesorios({ token }),
      window.api.listarRepuestos({ token }),
    ])
    if (p.ok) setProformas(p.data)
    if (m.ok) setMotos(m.data)
    if (a.ok) setAccesorios(a.data)
    if (r.ok) setRepuestos(r.data)
  }

  useEffect(() => { load() }, [])

  const addItem = () => {
    if (!itemForm.producto_id) return toast.error('Selecciona un producto')
    const payload = {
      cantidad: Number(itemForm.cantidad || 1),
      descuento_pct: Number(itemForm.descuento_pct || 0),
    }
    if (itemForm.tipo === 'moto') payload.moto_id = Number(itemForm.producto_id)
    if (itemForm.tipo === 'accesorio') payload.accesorio_id = Number(itemForm.producto_id)
    if (itemForm.tipo === 'repuesto') payload.repuesto_id = Number(itemForm.producto_id)

    setItems(prev => [...prev, payload])
    setItemForm({ ...itemForm, producto_id: '' })
  }

  const crearProforma = async () => {
    if (!cliente.nombre || !cliente.ci_nit || !cliente.celular) return toast.error('Completa datos del cliente')
    if (items.length === 0) return toast.error('Agrega al menos un ítem')

    const res = await window.api.crearProforma({
      token,
      data: {
        cliente_nombre: cliente.nombre,
        cliente_ci_nit: cliente.ci_nit,
        cliente_celular: cliente.celular,
        items,
      }
    })
    if (!res.ok) return toast.error(res.error || 'Error')

    toast.success('Proforma creada')
    setItems([])
    setCliente({ nombre: '', ci_nit: '', celular: '' })
    load()
  }

  const cancelar = async (id) => {
    const res = await window.api.cancelarProforma({ token, id })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Proforma cancelada')
    load()
  }

  const S = {
    page: { padding: 32, fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  const productos = itemForm.tipo === 'moto' ? motos : itemForm.tipo === 'accesorio' ? accesorios : repuestos

  return (
    <div style={S.page}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>PROFORMAS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Crear y gestionar</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Crear proforma</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
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
                    {itemForm.tipo === 'moto' ? `${p.marca} ${p.modelo}` : `${p.tipo} ${p.marca ? '· ' + p.marca : ''}`}
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
              <input style={S.input} type="number" value={itemForm.descuento_pct} onChange={e => setItemForm(f => ({ ...f, descuento_pct: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={addItem} style={S.btn}>Agregar ítem</button>
            <button onClick={crearProforma} style={S.btn}>Guardar proforma</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>Ítems</div>
            {items.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>Sin ítems</div> : (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-dim)' }}>
                {items.map((it, idx) => (
                  <li key={idx}>Cantidad {it.cantidad} · Desc {it.descuento_pct}%</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Proformas recientes</div>
          <div style={{ maxHeight: 480, overflow: 'auto' }}>
            {proformas.map(p => (
              <div key={p.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>{p.codigo} · {p.cliente_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{p.estado} · Total {p.total}</div>
                {p.estado === 'ACTIVA' && (
                  <button onClick={() => cancelar(p.id)} style={{ ...S.btn, marginTop: 6 }}>Cancelar</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
