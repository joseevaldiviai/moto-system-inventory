import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'

const INITIAL_USER_FORM = { nombre: '', username: '', password: '', rol: 'CAJERO', punto_venta_id: '' }
const INITIAL_POINT_FORM = { nombre: '', codigo: '' }

export default function Usuarios() {
  const { token } = useAuthStore()
  const [usuarios, setUsuarios] = useState([])
  const [puntos, setPuntos] = useState([])
  const [form, setForm] = useState(INITIAL_USER_FORM)
  const [pointForm, setPointForm] = useState(INITIAL_POINT_FORM)
  const [editId, setEditId] = useState(null)
  const [editPass, setEditPass] = useState('')
  const [editForm, setEditForm] = useState({ rol: 'CAJERO', punto_venta_id: '', activo: true })

  const load = async () => {
    const [usersRes, pointsRes] = await Promise.all([
      api.listarUsuarios({ token }),
      api.listarPuntosVenta({ token }),
    ])
    if (usersRes.ok) setUsuarios(usersRes.data)
    if (pointsRes.ok) setPuntos(pointsRes.data)
  }

  useEffect(() => { load() }, [])

  const crear = async () => {
    if (!form.nombre || !form.username || !form.password) return toast.error('Completa todos los campos')
    if (form.rol === 'CAJERO' && !form.punto_venta_id) return toast.error('Asigna un punto de venta al vendedor')
    const res = await api.crearUsuario({
      token,
      data: {
        ...form,
        punto_venta_id: form.punto_venta_id || null,
      },
    })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Usuario creado')
    setForm(INITIAL_USER_FORM)
    load()
  }

  const crearPunto = async () => {
    if (!pointForm.nombre.trim()) return toast.error('Ingresa un nombre para el punto de venta')
    const res = await api.crearPuntoVenta({ token, data: pointForm })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Punto de venta creado')
    setPointForm(INITIAL_POINT_FORM)
    load()
  }

  const startEdit = (usuario) => {
    setEditId(usuario.id)
    setEditPass('')
    setEditForm({
      rol: usuario.rol,
      punto_venta_id: usuario.punto_venta_id ? String(usuario.punto_venta_id) : '',
      activo: !!usuario.activo,
    })
  }

  const guardarUsuario = async () => {
    if (!editId) return
    if (editForm.rol === 'CAJERO' && !editForm.punto_venta_id) return toast.error('Asigna un punto de venta al vendedor')
    const res = await api.actualizarUsuario({
      token,
      id: editId,
      data: {
        rol: editForm.rol,
        activo: editForm.activo,
        punto_venta_id: editForm.punto_venta_id || null,
      },
    })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Usuario actualizado')
    setEditId(null)
    load()
  }

  const cambiarPassword = async () => {
    if (!editId) return
    if (!editPass) return toast.error('Ingresa una contraseña')
    const res = await api.actualizarUsuario({ token, id: editId, data: { password: editPass } })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Contraseña actualizada')
    setEditPass('')
  }

  const togglePointActive = async (point) => {
    const res = await api.actualizarPuntoVenta({
      token,
      id: point.id,
      data: { activo: !point.activo },
    })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Punto de venta actualizado')
    load()
  }

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  const puntosAsignables = puntos.filter((point) => point.activo)

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>USUARIOS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Usuarios, almacén central y puntos de venta</h1>
      </div>

      <div className="grid-two" style={{ marginBottom: 18 }}>
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Nuevo usuario</div>
          <div className="grid-two-tight">
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
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={S.label}>Punto de venta</div>
              <select style={S.input} value={form.punto_venta_id} onChange={e => setForm(f => ({ ...f, punto_venta_id: e.target.value }))}>
                <option value="">{form.rol === 'SUPERVISOR' ? 'Sin asignar / central' : 'Selecciona un punto de venta'}</option>
                {puntosAsignables.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.tipo === 'CENTRAL' ? 'Almacen Central' : point.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={crear} style={{ ...S.btn, marginTop: 10 }}>Crear usuario</button>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Nuevo punto de venta</div>
          <div className="grid-two-tight">
            <div>
              <div style={S.label}>Nombre</div>
              <input style={S.input} value={pointForm.nombre} onChange={e => setPointForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Código</div>
              <input style={S.input} value={pointForm.codigo} onChange={e => setPointForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Opcional" />
            </div>
          </div>
          <button onClick={crearPunto} style={{ ...S.btn, marginTop: 10 }}>Crear punto de venta</button>
        </div>
      </div>

      <div className="grid-two">
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Usuarios</div>
          <div className="list-scroll">
            {usuarios.map(u => (
              <div key={u.id} style={{ padding: '10px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>{u.nombre} · {u.username}</div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 6 }}>
                  {u.rol} · {u.activo ? 'Activo' : 'Inactivo'} · {u.punto_venta_nombre || 'Sin punto asignado'}
                </div>
                <div className="button-row" style={{ gap: 6 }}>
                  <button onClick={() => startEdit(u)} style={S.btn}>Editar</button>
                </div>
                {editId === u.id && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    <div className="grid-two-tight">
                      <div>
                        <div style={S.label}>Rol</div>
                        <select style={S.input} value={editForm.rol} onChange={e => setEditForm(f => ({ ...f, rol: e.target.value }))}>
                          <option value="SUPERVISOR">SUPERVISOR</option>
                          <option value="CAJERO">CAJERO</option>
                        </select>
                      </div>
                      <div>
                        <div style={S.label}>Estado</div>
                        <select style={S.input} value={editForm.activo ? '1' : '0'} onChange={e => setEditForm(f => ({ ...f, activo: e.target.value === '1' }))}>
                          <option value="1">Activo</option>
                          <option value="0">Inactivo</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <div style={S.label}>Punto de venta</div>
                      <select style={S.input} value={editForm.punto_venta_id} onChange={e => setEditForm(f => ({ ...f, punto_venta_id: e.target.value }))}>
                        <option value="">{editForm.rol === 'SUPERVISOR' ? 'Sin asignar / central' : 'Selecciona un punto de venta'}</option>
                        {puntosAsignables.map((point) => (
                          <option key={point.id} value={point.id}>
                            {point.tipo === 'CENTRAL' ? 'Almacen Central' : point.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="button-row" style={{ gap: 6 }}>
                      <button onClick={guardarUsuario} style={S.btn}>Guardar acceso</button>
                      <button onClick={() => setEditId(null)} style={S.btn}>Cerrar</button>
                    </div>
                    <div>
                      <div style={S.label}>Nueva contraseña</div>
                      <div className="button-row" style={{ gap: 6 }}>
                        <input type="password" style={S.input} value={editPass} onChange={e => setEditPass(e.target.value)} />
                        <button onClick={cambiarPassword} style={S.btn}>Guardar contraseña</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Puntos de venta</div>
          <div className="list-scroll">
            {puntos.map((point) => (
              <div key={point.id} style={{ padding: '10px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>
                  {point.tipo === 'CENTRAL' ? 'Almacen Central' : point.nombre}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 6 }}>
                  {point.codigo} · {point.tipo} · {point.activo ? 'Activo' : 'Inactivo'}
                </div>
                {point.tipo !== 'CENTRAL' && (
                  <button onClick={() => togglePointActive(point)} style={S.btn}>
                    {point.activo ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
