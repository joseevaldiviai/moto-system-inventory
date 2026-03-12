import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import logo from '../images/moto-seven7.jpeg'

export default function Login() {
  const [form, setForm]     = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate  = useNavigate()

  const handleLogin = async () => {
    if (!form.username || !form.password) return toast.error('Completa todos los campos')
    setLoading(true)
    try {
      const res = await window.api.login(form)
      if (!res.ok) return toast.error(res.error)
      login(res.data.token, res.data.usuario)
      toast.success(`Bienvenido, ${res.data.usuario.nombre}`)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const S = {
    wrap:  { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,var(--bg),var(--bg-2))', fontFamily:"Georgia,serif" },
    card:  { width:380, padding:'40px 36px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'0 24px 80px var(--shadow)' },
    label: { fontSize:11, color:'var(--text-muted)', letterSpacing:2, textTransform:'uppercase', display:'block', marginBottom:6 },
    input: { width:'100%', padding:'10px 14px', boxSizing:'border-box', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-strong)', fontSize:14, outline:'none', fontFamily:'monospace' },
    btn:   { width:'100%', padding:12, border:'none', borderRadius:8, color:'var(--accent-contrast)', fontSize:14, fontWeight:'bold', cursor:'pointer', letterSpacing:1 },
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:'100%', height:120, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
            <img src={logo} alt="Moto Systems" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:6 }}>Gestión de concesionario</div>
        </div>

        {['username','password'].map(field => (
          <div key={field} style={{ marginBottom: field==='username' ? 16 : 28 }}>
            <label style={S.label}>{field === 'username' ? 'Usuario' : 'Contraseña'}</label>
            <input
              type={field === 'password' ? 'password' : 'text'}
              value={form[field]}
              onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={S.input}
            />
          </div>
        ))}

        <button
          onClick={handleLogin} disabled={loading}
          style={{...S.btn, background: loading ? 'var(--accent-loading)' : 'var(--accent)', color: 'var(--accent-contrast)'}}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div style={{ marginTop:20, padding:12, background:'var(--bg-3)', borderRadius:8, fontSize:11, color:'var(--note)', textAlign:'center' }}>
          Primera vez: usa el botón de abajo para crear el admin inicial
        </div>
        <button
          onClick={async () => { const r = await window.api.seedAdmin(); toast[r.data?.ok ? 'success':'error'](r.data?.mensaje || r.error) }}
          style={{ width:'100%', marginTop:8, padding:'7px', background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)', borderRadius:6, cursor:'pointer', fontSize:11 }}
        >
          Crear admin inicial
        </button>
      </div>
    </div>
  )
}
