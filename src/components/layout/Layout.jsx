import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import logo from '../../images/moto-seven7.jpeg'
import { api } from '../../lib/apiClient'

const NAV = [
  { to:'/',          label:'Dashboard',  icon:'▦',  roles:['SUPERVISOR','CAJERO'] },
  { to:'/inventario',label:'Inventario', icon:'📦', roles:['SUPERVISOR','CAJERO'] },
  { to:'/proformas', label:'Proformas',  icon:'📋', roles:['SUPERVISOR','CAJERO'] },
  { to:'/ventas',    label:'Ventas',     icon:'💰', roles:['SUPERVISOR','CAJERO'] },
  { to:'/reportes',  label:'Reportes',   icon:'📊', roles:['SUPERVISOR','CAJERO'] },
  { to:'/manual',    label:'Manual',     icon:'📘', roles:['SUPERVISOR','CAJERO'] },
  { to:'/perfil',    label:'Mi Cuenta',  icon:'🔑', roles:['SUPERVISOR','CAJERO'] },
  { to:'/usuarios',  label:'Usuarios',   icon:'🔐', roles:['SUPERVISOR'] },
]

export default function Layout() {
  const { usuario, token, logout, tema, setTema } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [points, setPoints] = useState([])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!token || usuario?.rol !== 'SUPERVISOR') return
    api.listarPuntosVenta({ token }).then((res) => {
      if (res.ok) setPoints(res.data)
    })
  }, [token, usuario?.rol, location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  return (
    <div className="app-shell">
      <div className={`app-overlay ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)} />
      <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div style={{ padding:'20px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <img src={logo} alt="Moto Systems" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
        </div>

        <nav style={{ flex:1, padding:'12px 8px' }}>
          {NAV.filter(n => n.roles.includes(usuario?.rol)).map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              style={({ isActive }) => ({
                background:   isActive ? 'var(--nav-active)' : 'transparent',
                color:        isActive ? 'var(--accent)' : 'var(--text-dim)',
                borderLeft:   isActive ? '3px solid var(--accent)' : '3px solid transparent',
                fontWeight:   isActive ? 'bold' : 'normal',
              })}
              className="app-nav-link"
            >
              <span>{item.icon}</span><span>{item.label}</span>
            </NavLink>
          ))}
          {usuario?.rol === 'SUPERVISOR' && points.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', padding: '0 12px 8px' }}>
                Almacenes y tiendas
              </div>
              {points.map((point) => (
                <NavLink
                  key={point.id}
                  to={`/ubicaciones/${point.id}`}
                  style={({ isActive }) => ({
                    background: isActive ? 'var(--nav-active)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    fontWeight: isActive ? 'bold' : 'normal',
                  })}
                  className="app-nav-link"
                >
                  <span>{point.tipo === 'CENTRAL' ? '🏬' : '🏪'}</span>
                  <span>{point.tipo === 'CENTRAL' ? 'Almacen principal' : point.nombre}</span>
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        <div style={{ padding:16, borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, color:'var(--text-strong)', fontWeight:'bold', marginBottom:2 }}>{usuario?.nombre}</div>
          <div style={{
            display:'inline-block', fontSize:10, padding:'2px 8px', borderRadius:10, marginBottom:10,
            background: usuario?.rol === 'SUPERVISOR' ? 'var(--accent-weak)' : 'rgba(59,130,246,0.13)',
            color:      usuario?.rol === 'SUPERVISOR' ? 'var(--accent)'   : 'var(--info)',
            letterSpacing:1,
          }}>{usuario?.rol}</div>
          {usuario?.punto_venta_nombre && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>
              {usuario.punto_venta_tipo === 'CENTRAL' ? 'Almacen central' : usuario.punto_venta_nombre}
            </div>
          )}
          <button
            onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
            style={{
              width:'100%', padding:'6px', background:'transparent',
              border:'1px solid var(--border)', color:'var(--text-dim)', borderRadius:6,
              cursor:'pointer', fontSize:11, marginBottom:8,
            }}
          >
            {tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button onClick={handleLogout} style={{
            width:'100%', padding:7, background:'transparent',
            border:'1px solid var(--border)', color:'var(--text-dim)', borderRadius:6, cursor:'pointer', fontSize:12,
          }}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-mobile-bar">
          <button
            onClick={() => setMenuOpen(open => !open)}
            style={{
              padding:'8px 10px',
              border:'1px solid var(--border)',
              borderRadius:8,
              background:'transparent',
              color:'var(--text)',
              cursor:'pointer',
              fontSize:18,
              lineHeight:1,
            }}
            aria-label="Abrir navegación"
          >
            ☰
          </button>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12, color:'var(--accent)', letterSpacing:2, textTransform:'uppercase' }}>Moto System</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {usuario?.nombre}{usuario?.punto_venta_nombre ? ` · ${usuario.punto_venta_nombre}` : ''}
            </div>
          </div>
          <button
            onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
            style={{
              padding:'8px 10px',
              border:'1px solid var(--border)',
              borderRadius:8,
              background:'transparent',
              color:'var(--text)',
              cursor:'pointer',
              fontSize:12,
            }}
          >
            {tema === 'dark' ? 'Claro' : 'Oscuro'}
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
