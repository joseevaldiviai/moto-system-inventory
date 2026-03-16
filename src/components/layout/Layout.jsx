import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import logo from '../../images/moto-seven7.jpeg'

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
  const { usuario, logout, tema, setTema } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--bg)', fontFamily:"Georgia,serif", overflow:'hidden' }}>
      {/* SIDEBAR */}
      <aside style={{ width:220, background:'var(--bg-2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'20px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <img src={logo} alt="Moto Systems" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
        </div>

        <nav style={{ flex:1, padding:'12px 8px' }}>
          {NAV.filter(n => n.roles.includes(usuario?.rol)).map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 12px', borderRadius:8, marginBottom:2,
                textDecoration:'none', fontSize:13,
                background:   isActive ? 'var(--nav-active)' : 'transparent',
                color:        isActive ? 'var(--accent)' : 'var(--text-dim)',
                borderLeft:   isActive ? '3px solid var(--accent)' : '3px solid transparent',
                fontWeight:   isActive ? 'bold' : 'normal',
              })}
            >
              <span>{item.icon}</span><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ padding:16, borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, color:'var(--text-strong)', fontWeight:'bold', marginBottom:2 }}>{usuario?.nombre}</div>
          <div style={{
            display:'inline-block', fontSize:10, padding:'2px 8px', borderRadius:10, marginBottom:10,
            background: usuario?.rol === 'SUPERVISOR' ? 'var(--accent-weak)' : 'rgba(59,130,246,0.13)',
            color:      usuario?.rol === 'SUPERVISOR' ? 'var(--accent)'   : 'var(--info)',
            letterSpacing:1,
          }}>{usuario?.rol}</div>
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

      {/* CONTENT */}
      <main style={{ flex:1, overflow:'auto' }}><Outlet /></main>
    </div>
  )
}
