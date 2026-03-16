import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import useAuthStore from './store/authStore'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import Proformas from './pages/Proformas'
import Ventas from './pages/Ventas'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Perfil from './pages/Perfil'
import Manual from './pages/Manual'

function PrivateRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

function SupervisorRoute({ children }) {
  const { token, esSupervisor } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (!esSupervisor()) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { tema } = useAuthStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema || 'dark')
  }, [tema])

  return (
    <HashRouter>
      <Toaster position="top-right" toastOptions={{
        style: { background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
        success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--bg)' } },
        error:   { iconTheme: { primary: 'var(--danger)', secondary: 'var(--bg)' } },
      }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index             element={<Dashboard />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="proformas"  element={<Proformas />} />
          <Route path="ventas"     element={<Ventas />} />
          <Route path="reportes"   element={<Reportes />} />
          <Route path="manual"     element={<Manual />} />
          <Route path="perfil"     element={<Perfil />} />
          <Route path="usuarios"   element={<SupervisorRoute><Usuarios /></SupervisorRoute>} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
