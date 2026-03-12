import { create } from 'zustand'

const getThemeForUser = (usuario) => {
  if (usuario?.id) {
    return localStorage.getItem(`tema:${usuario.id}`) || localStorage.getItem('tema:default') || 'dark'
  }
  return localStorage.getItem('tema:default') || 'dark'
}

const useAuthStore = create((set, get) => ({
  token:   localStorage.getItem('token') || null,
  usuario: JSON.parse(localStorage.getItem('usuario') || 'null'),
  tema:    getThemeForUser(JSON.parse(localStorage.getItem('usuario') || 'null')),

  login: (token, usuario) => {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    const tema = getThemeForUser(usuario)
    set({ token, usuario, tema })
  },

  logout: async () => {
    const { token } = get()
    if (token) await window.api.logout({ token })
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    set({ token: null, usuario: null, tema: getThemeForUser(null) })
  },

  esSupervisor: () => get().usuario?.rol === 'SUPERVISOR',

  setTema: (tema) => {
    const user = get().usuario
    if (user?.id) localStorage.setItem(`tema:${user.id}`, tema)
    localStorage.setItem('tema:default', tema)
    set({ tema })
  },
}))

export default useAuthStore
