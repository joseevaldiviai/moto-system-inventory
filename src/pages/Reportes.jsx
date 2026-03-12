import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function Reportes() {
  const { token, esSupervisor } = useAuthStore()
  const [tipo, setTipo] = useState('ventas')
  const [usuarios, setUsuarios] = useState([])
  const [filtro, setFiltro] = useState({ fechaInicio: '', fechaFin: '', usuario_id: '', tipo_producto: '' })
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!esSupervisor()) return
    window.api.listarUsuarios({ token }).then(r => {
      if (r.ok) setUsuarios(r.data)
    })
  }, [])

  const generar = async () => {
    const payload = {
      token,
      fechaInicio: filtro.fechaInicio || undefined,
      fechaFin: filtro.fechaFin || undefined,
      usuario_id: filtro.usuario_id || undefined,
      tipo_producto: filtro.tipo_producto || undefined,
    }
    const res = tipo === 'ventas'
      ? await window.api.reporteVentas(payload)
      : await window.api.reporteProformas(payload)
    if (!res.ok) return toast.error(res.error || 'Error')
    setData(res.data)
  }

  const exportar = async () => {
    const payload = {
      token,
      fechaInicio: filtro.fechaInicio || undefined,
      fechaFin: filtro.fechaFin || undefined,
      usuario_id: filtro.usuario_id || undefined,
      tipo_producto: filtro.tipo_producto || undefined,
    }
    const res = tipo === 'ventas'
      ? await window.api.exportarReporteVentasPdf(payload)
      : await window.api.exportarReporteProformasPdf(payload)
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('PDF generado')
  }

  const rows = tipo === 'ventas' ? data?.ventas : data?.proformas

  const S = {
    page: { padding: 32, fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  return (
    <div style={S.page}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>REPORTES</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Ventas y Proformas</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTipo('ventas')} style={{ ...S.btn, background: tipo === 'ventas' ? 'var(--accent)' : 'transparent', color: tipo === 'ventas' ? 'var(--accent-contrast)' : 'var(--text-dim)' }}>Ventas</button>
        <button onClick={() => setTipo('proformas')} style={{ ...S.btn, background: tipo === 'proformas' ? 'var(--accent)' : 'transparent', color: tipo === 'proformas' ? 'var(--accent-contrast)' : 'var(--text-dim)' }}>Proformas</button>
      </div>

      <div style={S.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <div>
            <div style={S.label}>Desde</div>
            <input type="date" style={S.input} value={filtro.fechaInicio} onChange={e => setFiltro(f => ({ ...f, fechaInicio: e.target.value }))} />
          </div>
          <div>
            <div style={S.label}>Hasta</div>
            <input type="date" style={S.input} value={filtro.fechaFin} onChange={e => setFiltro(f => ({ ...f, fechaFin: e.target.value }))} />
          </div>
          <div>
            <div style={S.label}>Tipo producto</div>
            <select style={S.input} value={filtro.tipo_producto} onChange={e => setFiltro(f => ({ ...f, tipo_producto: e.target.value }))}>
              <option value="">Todos</option>
              <option value="moto">Moto</option>
              <option value="accesorio">Accesorio</option>
              <option value="repuesto">Repuesto</option>
            </select>
          </div>
          {esSupervisor() && (
            <div>
              <div style={S.label}>Usuario</div>
              <select style={S.input} value={filtro.usuario_id} onChange={e => setFiltro(f => ({ ...f, usuario_id: e.target.value }))}>
                <option value="">Todos</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={generar} style={S.btn}>Generar</button>
          <button onClick={exportar} style={S.btn}>Exportar PDF</button>
        </div>
      </div>

      <div style={{ marginTop: 14, ...S.card }}>
        {!rows ? (
          <div style={{ color: 'var(--text-muted)' }}>Sin datos</div>
        ) : (
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Fecha</th>
                  <th style={{ padding: '6px 4px' }}>Código</th>
                  <th style={{ padding: '6px 4px' }}>Vendedor</th>
                  <th style={{ padding: '6px 4px' }}>Cliente</th>
                  <th style={{ padding: '6px 4px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--divider)' }}>
                    <td style={{ padding: '6px 4px' }}>{tipo === 'ventas' ? r.fecha_venta : r.fecha_creacion}</td>
                    <td style={{ padding: '6px 4px' }}>{r.codigo}</td>
                    <td style={{ padding: '6px 4px' }}>{r.vendedor_nombre}</td>
                    <td style={{ padding: '6px 4px' }}>{r.cliente_nombre}</td>
                    <td style={{ padding: '6px 4px' }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
              Total registros: {rows.length}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
