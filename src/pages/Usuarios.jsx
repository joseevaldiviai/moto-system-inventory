import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function Usuarios() {
  const { token } = useAuthStore()
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState({ nombre: '', username: '', password: '', rol: 'CAJERO' })
  const [editId, setEditId] = useState(null)
  const [editPass, setEditPass] = useState('')

  const load = async () => {
    const res = await window.api.listarUsuarios({ token })
    if (res.ok) setUsuarios(res.data)
  }

  useEffect(() => { load() }, [])

  const crear = async () => {
    if (!form.nombre || !form.username || !form.password) return toast.error('Completa todos los campos')
    const res = await window.api.crearUsuario({ token, data: form })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Usuario creado')
    setForm({ nombre: '', username: '', password: '', rol: 'CAJERO' })
    load()
  }

  const cambiarPassword = async () => {
    if (!editId) return
    if (!editPass) return toast.error('Ingresa una contraseña')
    const res = await window.api.actualizarUsuario({ token, id: editId, data: { password: editPass } })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Contraseña actualizada')
    setEditId(null)
    setEditPass('')
    load()
  }

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
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>USUARIOS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Gestión</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Nuevo usuario</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={S.label}>Nombre</div>
              <input style={S.input} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Username</div>
              <input style={S.input} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Password</div>
              <input type="password" style={S.input} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Rol</div>
              <select style={S.input} value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="CAJERO">CAJERO</option>
              </select>
            </div>
          </div>
          <button onClick={crear} style={{ ...S.btn, marginTop: 10 }}>Crear</button>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Listado</div>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            {usuarios.map(u => (
              <div key={u.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>{u.nombre} · {u.username}</div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 6 }}>{u.rol} · {u.activo ? 'Activo' : 'Inactivo'}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setEditId(u.id); setEditPass('') }} style={S.btn}>Cambiar contraseña</button>
                </div>
                {editId === u.id && (
                  <div style={{ marginTop: 8 }}>
                    <div style={S.label}>Nueva contraseña</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="password" style={S.input} value={editPass} onChange={e => setEditPass(e.target.value)} />
                      <button onClick={cambiarPassword} style={S.btn}>Guardar</button>
                      <button onClick={() => { setEditId(null); setEditPass('') }} style={S.btn}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
