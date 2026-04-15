const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787';

function isBrowserRuntime() {
  return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}

function getApiOrigin() {
  try {
    return new URL(API_BASE_URL, isBrowserRuntime() ? window.location.origin : undefined);
  } catch {
    return null;
  }
}

function getApiConnectionError(error) {
  const message = error instanceof Error ? error.message : 'No se pudo conectar con la API';
  const apiUrl = getApiOrigin();
  const runningOnHttps = isBrowserRuntime() && window.location.protocol === 'https:';
  const pointsToLocalhost = apiUrl && ['127.0.0.1', 'localhost'].includes(apiUrl.hostname);

  if (runningOnHttps && pointsToLocalhost) {
    return `No se pudo conectar con la API configurada en ${API_BASE_URL}. Esta version publicada apunta a una API local. Configura VITE_API_BASE_URL con la URL publica del Worker y vuelve a desplegar.`;
  }

  if (message === 'Failed to fetch') {
    return `No se pudo conectar con la API en ${API_BASE_URL}. Verifica que el Worker este disponible y que VITE_API_BASE_URL sea correcta.`;
  }

  return message;
}

function getStoredSession() {
  return {
    token: localStorage.getItem('token'),
    refreshToken: localStorage.getItem('refresh_token'),
    sessionId: localStorage.getItem('session_id'),
    usuario: JSON.parse(localStorage.getItem('usuario') || 'null'),
  };
}

function storeSession({ token, refreshToken, sessionId, usuario }) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
  else localStorage.removeItem('refresh_token');
  if (sessionId) localStorage.setItem('session_id', sessionId);
  else localStorage.removeItem('session_id');
  if (usuario) localStorage.setItem('usuario', JSON.stringify(usuario));
  else localStorage.removeItem('usuario');
  window.dispatchEvent(new CustomEvent('auth:session-updated', {
    detail: { token, refreshToken, sessionId, usuario },
  }));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('session_id');
  localStorage.removeItem('usuario');
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}

async function rawRequest(path, options = {}) {
  const token = options.token;
  const sessionId = options.sessionId ?? getStoredSession().sessionId;
  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers['x-app-session-id'] = sessionId;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;
  return { response, payload };
}

async function refreshSession() {
  const { refreshToken, sessionId } = getStoredSession();
  if (!refreshToken || !sessionId) return null;

  const { response, payload } = await rawRequest('/auth/refresh', {
    method: 'POST',
    sessionId,
    body: { refresh_token: refreshToken, session_id: sessionId },
  });

  if (!response.ok || !payload?.ok) {
    clearSession();
    return null;
  }

  storeSession({
    token: payload.data.token,
    refreshToken: payload.data.refresh_token,
    sessionId: payload.data.session_id,
    usuario: payload.data.usuario,
  });

  return payload.data.token;
}

async function request(path, options = {}) {
  try {
    let token = options.token;
    let sessionId = options.sessionId;
    let { response, payload } = await rawRequest(path, { ...options, token, sessionId });

    if (response.status === 401 && token) {
      const newToken = await refreshSession();
      if (newToken) {
        token = newToken;
        sessionId = getStoredSession().sessionId;
        ({ response, payload } = await rawRequest(path, { ...options, token: newToken, sessionId }));
      }
    }

    if (response.status === 401) {
      clearSession();
    }

    if (!response.ok && payload) return payload;
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return payload;
  } catch (error) {
    return {
      ok: false,
      error: getApiConnectionError(error),
    };
  }
}

async function download(path, { token, filename } = {}) {
  let authToken = token;
  let sessionId = getStoredSession().sessionId;

  const makeDownloadRequest = async (currentToken, currentSessionId) => {
    const headers = {};
    if (currentToken) headers.authorization = `Bearer ${currentToken}`;
    if (currentSessionId) headers['x-app-session-id'] = currentSessionId;
    return fetch(`${API_BASE_URL}${path}`, { headers });
  };

  let response = await makeDownloadRequest(authToken, sessionId);

  if (response.status === 401 && authToken) {
    const newToken = await refreshSession();
    if (newToken) {
      authToken = newToken;
      sessionId = getStoredSession().sessionId;
      response = await makeDownloadRequest(authToken, sessionId);
    }
  }

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok) {
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : { ok: false, error: `HTTP ${response.status}` };
    return payload;
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const headerName = response.headers.get('content-disposition');
  const matched = headerName?.match(/filename="([^"]+)"/);
  link.href = href;
  link.download = matched?.[1] || filename || 'descarga';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return { ok: true, path: link.download };
}

async function safeDownload(path, options = {}) {
  try {
    return await download(path, options);
  } catch (error) {
    return {
      ok: false,
      error: getApiConnectionError(error),
    };
  }
}

function notMigrated(name) {
  return async () => ({ ok: false, error: `${name} aun no esta migrado en la API web` });
}

export const api = {
  backup: ({ token }) => safeDownload('/exports/backup', { token, filename: 'moto-system-backup.json' }),
  version: async () => ({ ok: true, data: { version: 'web-migration' } }),
  exportManualPdf: () => safeDownload('/exports/manual', { filename: 'manual-moto-system.html' }),

  configGet: ({ token }) => request('/config', { token }),
  configSet: ({ token, data }) => request('/config', { method: 'PUT', token, body: { data } }),

  seedAdmin: () => request('/auth/seed-admin', { method: 'POST' }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  refresh: ({ refreshToken, sessionId }) =>
    request('/auth/refresh', { method: 'POST', sessionId, body: { refresh_token: refreshToken, session_id: sessionId } }),
  me: ({ token }) => request('/auth/me', { token }),
  logout: ({ token }) => request('/auth/logout', { method: 'POST', token }),
  listarUsuarios: ({ token }) => request('/users', { token }),
  crearUsuario: ({ token, data }) => request('/users', { method: 'POST', token, body: { data } }),
  actualizarUsuario: ({ token, id, data }) => request(`/users/${id}`, { method: 'PATCH', token, body: { data } }),
  cambiarPassword: ({ token, actual, nueva }) =>
    request('/auth/change-password', { method: 'POST', token, body: { actual, nueva } }),

  listarMotos: ({ token, buscar, soloStock, scope, puntoVentaId } = {}) => {
    const query = new URLSearchParams();
    if (buscar) query.set('buscar', buscar);
    if (soloStock) query.set('soloStock', 'true');
    if (scope) query.set('scope', scope);
    if (puntoVentaId) query.set('punto_venta_id', puntoVentaId);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/products/motos${suffix}`, { token });
  },
  listarMotosE: ({ token, buscar, soloStock, scope, puntoVentaId } = {}) => {
    const query = new URLSearchParams();
    if (buscar) query.set('buscar', buscar);
    if (soloStock) query.set('soloStock', 'true');
    if (scope) query.set('scope', scope);
    if (puntoVentaId) query.set('punto_venta_id', puntoVentaId);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/products/motos-e${suffix}`, { token });
  },
  crearMoto: ({ token, data }) => request('/products/motos', { method: 'POST', token, body: { data } }),
  crearMotoE: ({ token, data }) => request('/products/motos-e', { method: 'POST', token, body: { data } }),
  actualizarMoto: ({ token, id, data }) => request(`/products/motos/${id}`, { method: 'PATCH', token, body: { data } }),
  actualizarMotoE: ({ token, id, data }) => request(`/products/motos-e/${id}`, { method: 'PATCH', token, body: { data } }),
  eliminarMoto: ({ token, id }) => request(`/products/motos/${id}`, { method: 'DELETE', token }),
  eliminarMotoE: ({ token, id }) => request(`/products/motos-e/${id}`, { method: 'DELETE', token }),
  importarMotosCsv: ({ token, csvText }) =>
    request('/products/motos/import', { method: 'POST', token, body: { csvText } }),
  importarMotosECsv: ({ token, csvText }) =>
    request('/products/motos-e/import', { method: 'POST', token, body: { csvText } }),
  exportarMotosArchivo: ({ token }) => safeDownload('/exports/inventory/motos', { token, filename: 'motos.csv' }),
  exportarMotosEArchivo: ({ token }) => safeDownload('/exports/inventory/motos-e', { token, filename: 'motos-e.csv' }),

  listarMarcas: ({ token }) => request('/brands', { token }),
  crearMarca: ({ token, data }) => request('/brands', { method: 'POST', token, body: { data } }),
  actualizarMarca: ({ token, id, data }) => request(`/brands/${id}`, { method: 'PATCH', token, body: { data } }),
  eliminarMarca: ({ token, id }) => request(`/brands/${id}`, { method: 'DELETE', token }),

  listarAccesorios: ({ token, buscar, soloStock, scope, puntoVentaId } = {}) => {
    const query = new URLSearchParams();
    if (buscar) query.set('buscar', buscar);
    if (soloStock) query.set('soloStock', 'true');
    if (scope) query.set('scope', scope);
    if (puntoVentaId) query.set('punto_venta_id', puntoVentaId);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/products/accesorios${suffix}`, { token });
  },
  crearAccesorio: ({ token, data }) => request('/products/accesorios', { method: 'POST', token, body: { data } }),
  actualizarAccesorio: ({ token, id, data }) => request(`/products/accesorios/${id}`, { method: 'PATCH', token, body: { data } }),
  eliminarAccesorio: ({ token, id }) => request(`/products/accesorios/${id}`, { method: 'DELETE', token }),
  importarAccesoriosCsv: ({ token, csvText }) =>
    request('/products/accesorios/import', { method: 'POST', token, body: { csvText } }),
  exportarAccesoriosArchivo: ({ token }) => safeDownload('/exports/inventory/accesorios', { token, filename: 'accesorios.csv' }),

  listarRepuestos: ({ token, buscar, soloStock, scope, puntoVentaId } = {}) => {
    const query = new URLSearchParams();
    if (buscar) query.set('buscar', buscar);
    if (soloStock) query.set('soloStock', 'true');
    if (scope) query.set('scope', scope);
    if (puntoVentaId) query.set('punto_venta_id', puntoVentaId);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/products/repuestos${suffix}`, { token });
  },
  listarPuntosVenta: ({ token }) => request('/points', { token }),
  crearPuntoVenta: ({ token, data }) => request('/points', { method: 'POST', token, body: { data } }),
  actualizarPuntoVenta: ({ token, id, data }) => request(`/points/${id}`, { method: 'PATCH', token, body: { data } }),
  transferirInventario: ({ token, data }) => request('/inventory/transfers', { method: 'POST', token, body: { data } }),
  crearAsignacionProductos: ({ token, data }) => request('/assignments', { method: 'POST', token, body: { data } }),
  listarAsignacionesProductos: ({ token, limit } = {}) => {
    const query = new URLSearchParams();
    if (limit) query.set('limit', String(limit));
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/assignments${suffix}`, { token });
  },
  obtenerAsignacionProductos: ({ token, codigo }) => request(`/assignments/${encodeURIComponent(codigo)}`, { token }),
  aplicarAsignacionProductos: ({ token, codigo }) => request(`/assignments/${encodeURIComponent(codigo)}/apply`, { method: 'POST', token }),
  crearRepuesto: ({ token, data }) => request('/products/repuestos', { method: 'POST', token, body: { data } }),
  actualizarRepuesto: ({ token, id, data }) => request(`/products/repuestos/${id}`, { method: 'PATCH', token, body: { data } }),
  eliminarRepuesto: ({ token, id }) => request(`/products/repuestos/${id}`, { method: 'DELETE', token }),
  importarRepuestosCsv: ({ token, csvText }) =>
    request('/products/repuestos/import', { method: 'POST', token, body: { csvText } }),
  exportarRepuestosArchivo: ({ token }) => safeDownload('/exports/inventory/repuestos', { token, filename: 'repuestos.csv' }),
  exportarProductosArchivo: ({ token }) => safeDownload('/exports/inventory/productos', { token, filename: 'productos.csv' }),

  listarTramites: ({ token, estado } = {}) => {
    const query = new URLSearchParams();
    if (estado) query.set('estado', estado);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/tramites${suffix}`, { token });
  },
  crearTramite: ({ token, data }) => request('/tramites', { method: 'POST', token, body: { data } }),
  actualizarTramite: ({ token, id, data }) => request(`/tramites/${id}`, { method: 'PATCH', token, body: { data } }),

  listarProformas: ({ token, estado, fecha, numero } = {}) => {
    const query = new URLSearchParams();
    if (estado) query.set('estado', estado);
    if (fecha) query.set('fecha', fecha);
    if (numero) query.set('numero', numero);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/quotes${suffix}`, { token });
  },
  obtenerProforma: ({ token, id }) => request(`/quotes/${id}`, { token }),
  crearProforma: ({ token, data }) => request('/quotes', { method: 'POST', token, body: { data } }),
  cancelarProforma: ({ token, id }) => request(`/quotes/${id}/cancel`, { method: 'POST', token }),
  exportarProformaArchivo: ({ token, id }) => safeDownload(`/exports/quotes/${id}`, { token, filename: `proforma-${id}.html` }),

  listarVentas: ({ token }) => request('/sales', { token }),
  obtenerVenta: ({ token, id }) => request(`/sales/${id}`, { token }),
  crearVenta: ({ token, data }) => request('/sales', { method: 'POST', token, body: { data } }),
  anularVenta: ({ token, id }) => request(`/sales/${id}/cancel`, { method: 'POST', token }),

  reporteVentas: ({ token, fechaInicio, fechaFin, usuario_id, tipo_producto } = {}) => {
    const query = new URLSearchParams();
    if (fechaInicio) query.set('fechaInicio', fechaInicio);
    if (fechaFin) query.set('fechaFin', fechaFin);
    if (usuario_id) query.set('usuario_id', usuario_id);
    if (tipo_producto) query.set('tipo_producto', tipo_producto);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/reports/sales${suffix}`, { token });
  },
  reporteProformas: ({ token, fechaInicio, fechaFin, usuario_id, tipo_producto } = {}) => {
    const query = new URLSearchParams();
    if (fechaInicio) query.set('fechaInicio', fechaInicio);
    if (fechaFin) query.set('fechaFin', fechaFin);
    if (usuario_id) query.set('usuario_id', usuario_id);
    if (tipo_producto) query.set('tipo_producto', tipo_producto);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/reports/quotes${suffix}`, { token });
  },
  reporteInventario: ({ token, scope, puntoVentaId } = {}) => {
    const query = new URLSearchParams();
    if (scope) query.set('scope', scope);
    if (puntoVentaId) query.set('punto_venta_id', puntoVentaId);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/reports/inventory${suffix}`, { token });
  },
  reporteTramites: ({ token, estado } = {}) => {
    const query = new URLSearchParams();
    if (estado) query.set('estado', estado);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/reports/tramites${suffix}`, { token });
  },
  exportarReporteVentasArchivo: ({ token, fechaInicio, fechaFin, usuario_id, tipo_producto } = {}) => {
    const query = new URLSearchParams();
    if (fechaInicio) query.set('fechaInicio', fechaInicio);
    if (fechaFin) query.set('fechaFin', fechaFin);
    if (usuario_id) query.set('usuario_id', usuario_id);
    if (tipo_producto) query.set('tipo_producto', tipo_producto);
    const suffix = query.toString() ? `?${query}` : '';
    return safeDownload(`/exports/reports/sales${suffix}`, { token, filename: 'reporte-ventas.csv' });
  },
  exportarReporteProformasArchivo: ({ token, fechaInicio, fechaFin, usuario_id, tipo_producto } = {}) => {
    const query = new URLSearchParams();
    if (fechaInicio) query.set('fechaInicio', fechaInicio);
    if (fechaFin) query.set('fechaFin', fechaFin);
    if (usuario_id) query.set('usuario_id', usuario_id);
    if (tipo_producto) query.set('tipo_producto', tipo_producto);
    const suffix = query.toString() ? `?${query}` : '';
    return safeDownload(`/exports/reports/quotes${suffix}`, { token, filename: 'reporte-proformas.csv' });
  },

  exportarReporteTramitesArchivo: ({ token, estado } = {}) => {
    const query = new URLSearchParams();
    if (estado) query.set('estado', estado);
    const suffix = query.toString() ? `?${query}` : '';
    return safeDownload(`/exports/reports/tramites${suffix}`, { token, filename: 'reporte-tramites.csv' });
  },
};

export { clearSession, getStoredSession, refreshSession, storeSession };
