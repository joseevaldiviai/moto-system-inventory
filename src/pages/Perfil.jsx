import { useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function Perfil() {
  const { token, usuario, esSupervisor } = useAuthStore()
  const [form, setForm] = useState({ actual: '', nueva: '', confirmar: '' })
  const [loading, setLoading] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)

  const cambiar = async () => {
    if (!form.actual || !form.nueva || !form.confirmar) return toast.error('Completa todos los campos')
    if (form.nueva !== form.confirmar) return toast.error('La confirmación no coincide')

    setLoading(true)
    try {
      const res = await window.api.cambiarPassword({
        token,
        actual: form.actual,
        nueva: form.nueva,
      })
      if (!res.ok) return toast.error(res.error || 'Error')
      toast.success('Contraseña actualizada')
      setForm({ actual: '', nueva: '', confirmar: '' })
    } finally {
      setLoading(false)
    }
  }

  const respaldar = async () => {
    setBackupLoading(true)
    try {
      const res = await window.api.backup({ token })
      if (!res?.ok) return toast.error(res?.error || 'No se pudo generar el respaldo')
      toast.success(`Respaldo guardado: ${res.path}`)
    } catch {
      toast.error('Error al generar respaldo')
    } finally {
      setBackupLoading(false)
    }
  }

  const S = {
    page: { padding: 32, fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 520 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  return (
    <div style={S.page}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>MI CUENTA</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Perfil</h1>
        <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>{usuario?.nombre} · {usuario?.username}</div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Cambiar contraseña</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div>
            <div style={S.label}>Contraseña actual</div>
            <input type="password" style={S.input} value={form.actual} onChange={e => setForm(f => ({ ...f, actual: e.target.value }))} />
          </div>
          <div>
            <div style={S.label}>Nueva contraseña</div>
            <input type="password" style={S.input} value={form.nueva} onChange={e => setForm(f => ({ ...f, nueva: e.target.value }))} />
          </div>
          <div>
            <div style={S.label}>Confirmar nueva contraseña</div>
            <input type="password" style={S.input} value={form.confirmar} onChange={e => setForm(f => ({ ...f, confirmar: e.target.value }))} />
          </div>
        </div>
        <button onClick={cambiar} disabled={loading} style={{ ...S.btn, marginTop: 10, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {esSupervisor() && (
        <div style={{ ...S.card, marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Respaldo de base de datos</div>
          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
            Genera una copia de seguridad manual en un archivo `.db`.
          </div>
          <button onClick={respaldar} disabled={backupLoading} style={{ ...S.btn, marginTop: 10, opacity: backupLoading ? 0.7 : 1 }}>
            {backupLoading ? 'Generando...' : 'Sacar respaldo'}
          </button>
        </div>
      )}
    </div>
  )
}
