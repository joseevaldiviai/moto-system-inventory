import { create } from 'zustand'
import { api, clearSession } from '../lib/apiClient'

const getThemeForUser = (usuario) => {
  if (usuario?.id) {
    return localStorage.getItem(`tema:${usuario.id}`) || localStorage.getItem('tema:default') || 'dark'
  }
  return localStorage.getItem('tema:default') || 'dark'
}

const useAuthStore = create((set, get) => ({
  token:   localStorage.getItem('token') || null,
  refreshToken: localStorage.getItem('refresh_token') || null,
  sessionId: localStorage.getItem('session_id') || null,
  usuario: JSON.parse(localStorage.getItem('usuario') || 'null'),
  tema:    getThemeForUser(JSON.parse(localStorage.getItem('usuario') || 'null')),
  authReady: false,

  login: (token, usuario, refreshToken = null, sessionId = null) => {
    localStorage.setItem('token', token)
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
    else localStorage.removeItem('refresh_token')
    if (sessionId) localStorage.setItem('session_id', sessionId)
    else localStorage.removeItem('session_id')
    localStorage.setItem('usuario', JSON.stringify(usuario))
    const tema = getThemeForUser(usuario)
    set({ token, refreshToken, sessionId, usuario, tema, authReady: true })
  },

  initializeAuth: async () => {
    const { token, sessionId } = get()
    if (!token || !sessionId) {
      clearSession()
      set({ authReady: true, token: null, refreshToken: null, sessionId: null, usuario: null })
      return
    }

    const res = await api.me({ token })
    if (!res.ok) {
      clearSession()
      set({ token: null, refreshToken: null, sessionId: null, usuario: null, tema: getThemeForUser(null), authReady: true })
      return
    }

    const usuario = res.data?.usuario ?? null
    localStorage.setItem('usuario', JSON.stringify(usuario))
    set({
      token,
      refreshToken: localStorage.getItem('refresh_token') || null,
      sessionId: localStorage.getItem('session_id') || null,
      usuario,
      tema: getThemeForUser(usuario),
      authReady: true,
    })
  },

  logout: async () => {
    const { token } = get()
    if (token) await api.logout({ token })
    clearSession()
    set({ token: null, refreshToken: null, sessionId: null, usuario: null, tema: getThemeForUser(null), authReady: true })
  },

  esSupervisor: () => get().usuario?.rol === 'SUPERVISOR',

  setTema: (tema) => {
    const user = get().usuario
    if (user?.id) localStorage.setItem(`tema:${user.id}`, tema)
    localStorage.setItem('tema:default', tema)
    set({ tema })
  },

  attachSessionListeners: () => {
    const onExpired = () => {
      set({ token: null, refreshToken: null, sessionId: null, usuario: null, tema: getThemeForUser(null), authReady: true })
    }

    const onUpdated = (event) => {
      const { token, refreshToken, sessionId, usuario } = event.detail || {}
      set({
        token: token || null,
        refreshToken: refreshToken || null,
        sessionId: sessionId || null,
        usuario: usuario || null,
        tema: getThemeForUser(usuario || null),
        authReady: true,
      })
    }

    window.addEventListener('auth:session-expired', onExpired)
    window.addEventListener('auth:session-updated', onUpdated)

    return () => {
      window.removeEventListener('auth:session-expired', onExpired)
      window.removeEventListener('auth:session-updated', onUpdated)
    }
  },

  startSessionMonitor: () => {
    const intervalId = window.setInterval(async () => {
      const { token, sessionId, authReady } = get()
      if (!authReady || !token || !sessionId) return
      const res = await api.me({ token })
      if (!res.ok) {
        clearSession()
        set({ token: null, refreshToken: null, sessionId: null, usuario: null, tema: getThemeForUser(null), authReady: true })
      }
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  },

  forceLogout: () => {
    clearSession()
    set({ token: null, refreshToken: null, sessionId: null, usuario: null, tema: getThemeForUser(null), authReady: true })
  },
}))

export default useAuthStore
