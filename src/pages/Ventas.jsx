import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'

export default function Ventas() {
  const { token } = useAuthStore()
  const [proformas, setProformas] = useState([])
  const [detail, setDetail] = useState(null)
  const [tramites, setTramites] = useState({})
  const [costos, setCostos] = useState({ bsisa: 0, placa: 0 })
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`

  const load = async () => {
    const res = await api.listarProformas({ token, estado: 'ACTIVA' })
    if (res.ok) setProformas(res.data)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    api.configGet({ token }).then(r => {
      if (!r.ok) return
      setCostos({
        bsisa: Number(r.data?.tramite_bsisa_costo ?? 0),
        placa: Number(r.data?.tramite_placa_costo ?? 0),
      })
    })
  }, [token])

  const openDetail = async (id) => {
    const res = await api.obtenerProforma({ token, id })
    if (!res.ok) return toast.error(res.error || 'Error')
    setDetail(res.data)
  }

  const toggleTramite = (piId, tipo) => {
    setTramites(prev => {
      const current = prev[piId] || { bsisa: false, placa: false }
      return { ...prev, [piId]: { ...current, [tipo]: !current[tipo] } }
    })
  }

  const consolidar = async (id) => {
    const tramitesPayload = []
    for (const [piId, flags] of Object.entries(tramites)) {
      if (flags.bsisa) tramitesPayload.push({ proforma_item_id: Number(piId), tipo: 'BSISA' })
      if (flags.placa) tramitesPayload.push({ proforma_item_id: Number(piId), tipo: 'PLACA' })
    }

    const res = await api.crearVenta({ token, data: { proforma_id: id, tramites: tramitesPayload } })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Venta consolidada')
    setDetail(null)
    setTramites({})
    load()
  }

  const tramitesTotal = () => {
    let total = 0
    for (const [piId, flags] of Object.entries(tramites)) {
      if (flags.bsisa) total += costos.bsisa
      if (flags.placa) total += costos.placa
    }
    return total
  }

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>VENTAS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Consolidar proformas</h1>
      </div>

      <div style={S.card}>
        {proformas.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No hay proformas activas</div>
        ) : proformas.map(p => (
          <div key={p.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
            <div style={{ fontSize: 12 }}>{p.codigo} · {p.cliente_nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Total {p.total} · {p.fecha_creacion}</div>
            <div className="button-row" style={{ marginTop: 6 }}>
              <button onClick={() => openDetail(p.id)} style={S.btn}>Ver items</button>
              <button onClick={() => consolidar(p.id)} style={S.btn}>Consolidar venta</button>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <div style={{ ...S.card, marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Trámites para {detail.codigo}</div>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 10 }}>BSISA: {formatBs(costos.bsisa)} · PLACA: {formatBs(costos.placa)}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.items.map(it => (
              <div key={it.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>{it.descripcion} · Cant {it.cantidad}</div>
                {it.moto_id ? (
                  <div className="button-row" style={{ gap: 12, marginTop: 6, fontSize: 12 }}>
                    <label>
                      <input type="checkbox" checked={!!tramites[it.id]?.bsisa} onChange={() => toggleTramite(it.id, 'bsisa')} /> BSISA
                    </label>
                    <label>
                      <input type="checkbox" checked={!!tramites[it.id]?.placa} onChange={() => toggleTramite(it.id, 'placa')} /> PLACA
                    </label>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No aplica (no es moto)</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
            Total proforma: {formatBs(detail.total)} · Trámites: {formatBs(tramitesTotal())} · Total final: {formatBs(Number(detail.total) + tramitesTotal())}
          </div>
          <div className="button-row" style={{ marginTop: 10 }}>
            <button onClick={() => setDetail(null)} style={S.btn}>Cerrar</button>
            <button onClick={() => consolidar(detail.id)} style={S.btn}>Consolidar con trámites</button>
          </div>
        </div>
      )}
    </div>
  )
}
