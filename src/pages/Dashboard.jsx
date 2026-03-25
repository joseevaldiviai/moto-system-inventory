import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'

export default function Dashboard() {
  const { usuario, token, esSupervisor } = useAuthStore()
  const [stats, setStats]   = useState(null)
  const [config, setConfig] = useState({ bsisa: '', placa: '' })
  const navigate            = useNavigate()
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`

  useEffect(() => {
    api.reporteInventario({ token })
      .then(r => { if (r.ok) setStats(r.data) })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!esSupervisor()) return
    api.configGet({ token }).then(r => {
      if (!r.ok) return
      setConfig({
        bsisa: r.data?.tramite_bsisa_costo ?? '0',
        placa: r.data?.tramite_placa_costo ?? '0',
      })
    })
  }, [token])

  const guardarConfig = async () => {
    const res = await api.configSet({
      token,
      data: {
        tramite_bsisa_costo: config.bsisa,
        tramite_placa_costo: config.placa,
      }
    })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Costos actualizados')
  }

  const cards = stats ? [
    { label:'Motos en stock',    value: stats.motos.total_unidades,      sub:`${stats.motos.items.length} registros`,      color:'#f59e0b', icon:'🏍️' },
    { label:'Motos-E en stock',  value: stats.motos_e.total_unidades,    sub:`${stats.motos_e.items.length} registros`,    color:'#14b8a6', icon:'🔋' },
    { label:'Accesorios',        value: stats.accesorios.total_unidades,  sub:`${stats.accesorios.items.length} tipos`,     color:'#3b82f6', icon:'🛡️' },
    { label:'Repuestos',         value: stats.repuestos.total_unidades,   sub:`${stats.repuestos.items.length} tipos`,      color:'#8b5cf6', icon:'⚙️' },
    { label:'Valor inventario',  value: formatBs(stats.motos.valor_total + stats.motos_e.valor_total + stats.accesorios.valor_total + stats.repuestos.valor_total), sub:'motos + motos-e + accesorios + repuestos', color:'#10b981', icon:'💰' },
  ] : []

  return (
    <div className="page-shell">
      <div className="page-header" style={{ marginBottom:28 }}>
        <div style={{ fontSize:10, letterSpacing:4, color:'var(--accent)', textTransform:'uppercase', fontFamily:'monospace' }}>PANEL PRINCIPAL</div>
        <h1 style={{ margin:'4px 0 0', fontSize:24, color:'var(--text-strong)' }}>Bienvenido, {usuario?.nombre}</h1>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{new Date().toLocaleDateString('es-BO', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px,1fr))', gap:16, marginBottom:28 }}>
        {cards.length === 0
          ? [1,2,3,4,5].map(i => (
            <div key={i} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 22px', opacity:0.4 }}>
              <div style={{ width:60, height:10, background:'var(--border)', borderRadius:4, marginBottom:12 }}/>
              <div style={{ width:40, height:28, background:'var(--border)', borderRadius:4 }}/>
            </div>
          ))
          : cards.map(c => (
            <div key={c.label} style={{ background:'var(--card)', border:`1px solid ${c.color}33`, borderRadius:12, padding:'20px 22px' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>{c.icon}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>{c.label}</div>
              <div style={{ fontSize:26, fontFamily:'monospace', color:c.color, fontWeight:'bold' }}>{c.value}</div>
              <div style={{ fontSize:11, color:'var(--note)', marginTop:4 }}>{c.sub}</div>
            </div>
          ))
        }
      </div>

      {/* Accesos rápidos */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>Accesos rápidos</div>
        <div className="button-row" style={{ gap:10 }}>
          {[
            { label:'+ Nueva venta',    to:'/ventas',     color:'#10b981' },
            { label:'+ Nueva proforma', to:'/proformas',  color:'#3b82f6' },
            { label:'Ver inventario',   to:'/inventario', color:'#f59e0b' },
            { label:'Reportes',         to:'/reportes',   color:'#8b5cf6' },
          ].map(btn => (
            <button key={btn.label} onClick={() => navigate(btn.to)} style={{
              padding:'8px 18px', borderRadius:20,
              background:`${btn.color}18`, border:`1px solid ${btn.color}`,
              color:btn.color, fontSize:13, cursor:'pointer',
            }}>{btn.label}</button>
          ))}
        </div>
      </div>

      {esSupervisor() && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>Costos de trámites</div>
          <div className="grid-three" style={{ gap:12, alignItems:'end' }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>BSISA</div>
              <input
                style={{ width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)' }}
                value={config.bsisa}
                onChange={e => setConfig(c => ({ ...c, bsisa: e.target.value }))}
              />
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{formatBs(config.bsisa)}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>PLACA</div>
              <input
                style={{ width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)' }}
                value={config.placa}
                onChange={e => setConfig(c => ({ ...c, placa: e.target.value }))}
              />
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{formatBs(config.placa)}</div>
            </div>
            <button onClick={guardarConfig} style={{ padding:'8px 14px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text-dim)', cursor:'pointer', fontSize:12 }}>
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
