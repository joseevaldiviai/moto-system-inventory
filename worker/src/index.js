import { json, empty, readJson, notFound, fail, attachment, withCors } from './lib/http';
import { createAdminClient, createPublicClient, requireAuth, requireSupervisor } from './lib/supabase';
import { getInventoryConfig, normalizeStocks, resolveMarca, validatePricing } from './lib/inventory';
import { parseCsv, requireColumns, rowObject, requiredNumber, numberOrZero, textOrNull } from './lib/csv';

const POINT_TYPES = {
  CENTRAL: 'CENTRAL',
  POS: 'PUNTO_VENTA',
};

const PRODUCT_TABLES = ['motos', 'motos_e', 'accesorios', 'repuestos'];

async function setActiveSession(admin, userId, sessionId) {
  const patch = {
    sesion_activa_id: sessionId,
    sesion_activa_actualizada_en: sessionId ? new Date().toISOString() : null,
  };
  const { error } = await admin.from('user_profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}

function normalizePointCode(nombre, codigo = '') {
  const raw = String(codigo || nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

  return raw || `PV_${Date.now()}`;
}

async function getCentralPoint(admin) {
  const { data, error } = await admin
    .from('puntos_venta')
    .select('id, nombre, codigo, tipo, activo')
    .eq('tipo', POINT_TYPES.CENTRAL)
    .single();

  if (error || !data) throw new Error(error?.message || 'No existe almacen central configurado');
  return data;
}

async function getPointById(admin, pointId) {
  const { data, error } = await admin
    .from('puntos_venta')
    .select('id, nombre, codigo, tipo, activo')
    .eq('id', Number(pointId))
    .single();

  if (error || !data) throw new Error('Punto de venta no encontrado');
  return data;
}

async function enrichUser(admin, profile) {
  if (!profile) return null;
  if (!profile.punto_venta_id) {
    return {
      ...profile,
      punto_venta_nombre: null,
      punto_venta_tipo: null,
    };
  }

  const point = await getPointById(admin, profile.punto_venta_id);
  return {
    ...profile,
    punto_venta_nombre: point.nombre,
    punto_venta_tipo: point.tipo,
  };
}

function mapSessionUser(profile) {
  return {
    id: profile.id,
    nombre: profile.nombre,
    username: profile.username,
    rol: profile.rol,
    punto_venta_id: profile.punto_venta_id ?? null,
    punto_venta_nombre: profile.punto_venta_nombre ?? null,
    punto_venta_tipo: profile.punto_venta_tipo ?? null,
  };
}

async function resolveInventoryScope({ admin, profile, requestedScope, requestedPointId }) {
  if (requestedScope === 'all') {
    if (profile.rol !== 'SUPERVISOR') throw new Error('Solo Supervisor puede ver el inventario general');
    return { scope: 'all', pointId: null, point: { id: null, nombre: 'Inventario general', tipo: 'GLOBAL' } };
  }

  if (requestedScope === 'central') {
    if (profile.rol !== 'SUPERVISOR') throw new Error('Solo Supervisor puede ver el almacen central');
    const central = await getCentralPoint(admin);
    return { scope: 'central', pointId: central.id, point: central };
  }

  if (requestedScope === 'point') {
    if (!requestedPointId) throw new Error('punto_venta_id requerido');
    if (profile.rol !== 'SUPERVISOR' && Number(profile.punto_venta_id) !== Number(requestedPointId)) {
      throw new Error('No autorizado para consultar ese punto de venta');
    }
    const point = await getPointById(admin, requestedPointId);
    return { scope: point.tipo === POINT_TYPES.CENTRAL ? 'central' : 'point', pointId: point.id, point };
  }

  if (profile.rol === 'SUPERVISOR') {
    const central = await getCentralPoint(admin);
    return { scope: 'central', pointId: central.id, point: central };
  }

  if (profile.punto_venta_id) {
    const point = await getPointById(admin, profile.punto_venta_id);
    return { scope: point.tipo === POINT_TYPES.CENTRAL ? 'central' : 'point', pointId: point.id, point };
  }

  throw new Error('El usuario no tiene punto de venta asignado');
}

function buildProductSearchQuery(admin, config, buscar) {
  let query = admin.from(config.table).select('*').eq('activo', true).order('creado_en', { ascending: false });
  if (buscar) {
    const clauses = config.search.map((field) => `${field}.ilike.%${buscar}%`);
    query = query.or(clauses.join(','));
  }
  return query;
}

async function listInventoryRows({ admin, kind, buscar, soloStock, scope, pointId }) {
  const config = getInventoryConfig(kind);
  const baseQuery = buildProductSearchQuery(admin, config, buscar);

  if (scope === 'all') {
    const { data: products, error: productsError } = await baseQuery;
    if (productsError) throw new Error(productsError.message);

    const productIds = (products || []).map((row) => row.id);
    const stockMap = new Map();

    if (productIds.length) {
      let pointStockQuery = admin
        .from('inventario_puntos_venta')
        .select('producto_id, cantidad_libre, cantidad_reservada, cantidad_vendida')
        .eq('producto_tipo', kind)
        .in('producto_id', productIds);

      const { data: pointStocks, error: pointStockError } = await pointStockQuery;
      if (pointStockError) throw new Error(pointStockError.message);

      for (const row of pointStocks || []) {
        const productId = Number(row.producto_id);
        const current = stockMap.get(productId) || { libre: 0, reservada: 0, vendida: 0 };
        current.libre += Number(row.cantidad_libre || 0);
        current.reservada += Number(row.cantidad_reservada || 0);
        current.vendida += Number(row.cantidad_vendida || 0);
        stockMap.set(productId, current);
      }
    }

    return (products || [])
      .map((product) => {
        const pointStock = stockMap.get(Number(product.id)) || { libre: 0, reservada: 0, vendida: 0 };
        const cantidadLibre = Number(product.cantidad_libre || 0) + pointStock.libre;
        const cantidadReservada = Number(product.cantidad_reservada || 0) + pointStock.reservada;
        const cantidadVendida = Number(product.cantidad_vendida || 0) + pointStock.vendida;

        if (soloStock && cantidadLibre <= 0) return null;

        return {
          ...product,
          cantidad_libre: cantidadLibre,
          cantidad_reservada: cantidadReservada,
          cantidad_vendida: cantidadVendida,
          punto_venta_id: null,
          punto_venta_nombre: 'Inventario general',
          punto_venta_tipo: 'GLOBAL',
        };
      })
      .filter(Boolean);
  }

  const point = await getPointById(admin, pointId);
  const pointName = point.tipo === POINT_TYPES.CENTRAL ? 'Almacen Central' : point.nombre;

  if (scope === 'central') {
    let query = baseQuery;
    if (soloStock) query = query.gt('cantidad_libre', 0);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || [])
      .filter((product) => (
        Number(product.cantidad_libre || 0) > 0
        || Number(product.cantidad_reservada || 0) > 0
        || Number(product.cantidad_vendida || 0) > 0
      ))
      .map((product) => ({
        ...product,
        punto_venta_id: pointId,
        punto_venta_nombre: pointName,
        punto_venta_tipo: point.tipo,
      }));
  }

  const { data: products, error: productsError } = await baseQuery;
  if (productsError) throw new Error(productsError.message);

  const productIds = (products || []).map((row) => row.id);
  if (!productIds.length) return [];

  let stockQuery = admin
    .from('inventario_puntos_venta')
    .select('producto_id, cantidad_libre, cantidad_reservada, cantidad_vendida')
    .eq('punto_venta_id', pointId)
    .eq('producto_tipo', kind)
    .in('producto_id', productIds);

  if (soloStock) stockQuery = stockQuery.gt('cantidad_libre', 0);

  const { data: stocks, error: stockError } = await stockQuery;
  if (stockError) throw new Error(stockError.message);

  const stockMap = new Map((stocks || []).map((row) => [Number(row.producto_id), row]));
  return (products || [])
    .map((product) => {
      const stock = stockMap.get(Number(product.id));
      if (!stock) return null;
      return {
        ...product,
        cantidad_libre: Number(stock.cantidad_libre || 0),
        cantidad_reservada: Number(stock.cantidad_reservada || 0),
        cantidad_vendida: Number(stock.cantidad_vendida || 0),
        punto_venta_id: pointId,
        punto_venta_nombre: pointName,
        punto_venta_tipo: point.tipo,
      };
    })
    .filter(Boolean);
}

async function handleAuthLogin(request, env) {
  const { username, password } = await readJson(request);
  if (!username || !password) return fail('Usuario y contrasena son requeridos');

  const admin = createAdminClient(env);
  const publicClient = createPublicClient(env);

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, email, username, nombre, rol, activo, punto_venta_id')
    .eq('username', username)
    .single();

  if (profileError || !profile || !profile.activo) return fail('Usuario o contrasena incorrectos', 401);

  const { data: loginData, error: loginError } = await publicClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });

  if (loginError || !loginData?.session) return fail('Usuario o contrasena incorrectos', 401);

  const sessionId = crypto.randomUUID();
  try {
    await setActiveSession(admin, profile.id, sessionId);
  } catch (error) {
    return fail(error.message, 500);
  }

  return json({
    ok: true,
    data: {
      token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      session_id: sessionId,
      usuario: mapSessionUser(await enrichUser(admin, profile)),
    },
  });
}

async function handleAuthRefresh(request, env) {
  const { refresh_token, session_id } = await readJson(request);
  if (!refresh_token || !session_id) return fail('refresh_token y session_id son requeridos', 401);

  const publicClient = createPublicClient(env);
  const { data: refreshData, error: refreshError } = await publicClient.auth.refreshSession({
    refresh_token,
  });

  if (refreshError || !refreshData?.session) return fail('Sesion invalida o expirada', 401);

  const admin = createAdminClient(env);
  const { data: authData, error: authError } = await admin.auth.getUser(refreshData.session.access_token);
  if (authError || !authData?.user) return fail('Sesion invalida o expirada', 401);

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, email, username, nombre, rol, activo, sesion_activa_id, punto_venta_id')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile || !profile.activo) return fail('Usuario no autorizado', 401);
  if (!profile.sesion_activa_id || profile.sesion_activa_id !== session_id) {
    return fail('La sesion fue reemplazada por un nuevo inicio de sesion', 401);
  }

  return json({
    ok: true,
    data: {
      token: refreshData.session.access_token,
      refresh_token: refreshData.session.refresh_token,
      session_id,
      usuario: mapSessionUser(await enrichUser(admin, profile)),
    },
  });
}

async function handleAuthMe(request, env) {
  const session = await requireAuth(request, env);
  return json({
    ok: true,
    data: {
      usuario: mapSessionUser(await enrichUser(session.admin, session.profile)),
    },
  });
}

async function handleAuthLogout(request, env) {
  const session = await requireAuth(request, env);
  try {
    await setActiveSession(session.admin, session.profile.id, null);
  } catch (error) {
    return fail(error.message, 500);
  }
  return json({ ok: true });
}

async function handleChangePassword(request, env) {
  const session = await requireAuth(request, env);
  const { actual, nueva } = await readJson(request);
  if (!actual || !nueva) return fail('actual y nueva son requeridos');

  const publicClient = createPublicClient(env);
  const { error: reloginError } = await publicClient.auth.signInWithPassword({
    email: session.profile.email,
    password: actual,
  });
  if (reloginError) return fail('Contrasena actual incorrecta', 401);

  const { error: updateError } = await session.admin.auth.admin.updateUserById(session.profile.id, {
    password: nueva,
  });
  if (updateError) return fail(updateError.message, 400);

  return json({ ok: true });
}

async function handleSeedAdmin(_request, env) {
  const admin = createAdminClient(env);
  const { data: existing } = await admin
    .from('user_profiles')
    .select('id')
    .eq('rol', 'SUPERVISOR')
    .limit(1);

  if (existing?.length) return json({ ok: true, data: { ok: false, mensaje: 'Ya existe un supervisor' } });

  const email = 'admin@motosystem.local';
  const password = 'admin123';

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) return fail(createError?.message || 'No se pudo crear el admin');

  const { error: profileError } = await admin.from('user_profiles').insert({
    id: created.user.id,
    email,
    username: 'admin',
    nombre: 'Administrador',
    rol: 'SUPERVISOR',
    activo: true,
  });

  if (profileError) return fail(profileError.message);

  return json({
    ok: true,
    data: { ok: true, mensaje: 'Admin creado - usuario: admin / contrasena: admin123' },
  });
}

async function handleConfigGet(request, env) {
  const { admin } = await requireAuth(request, env);
  const { data, error } = await admin.from('config').select('key, value');
  if (error) return fail(error.message, 500);
  return json({ ok: true, data: Object.fromEntries((data || []).map((row) => [row.key, row.value])) });
}

async function handleConfigSet(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const entries = Object.entries(data || {}).map(([key, value]) => ({ key, value: String(value) }));
  if (!entries.length) return fail('Nada que actualizar');
  const { error } = await admin.from('config').upsert(entries);
  if (error) return fail(error.message, 500);
  return json({ ok: true });
}

async function handleUsersList(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, nombre, username, rol, activo, creado_en, punto_venta_id')
    .order('nombre');
  if (error) return fail(error.message, 500);

  const pointIds = [...new Set((data || []).map((row) => row.punto_venta_id).filter(Boolean))];
  const pointsMap = new Map();
  if (pointIds.length) {
    const { data: points, error: pointsError } = await admin
      .from('puntos_venta')
      .select('id, nombre, tipo')
      .in('id', pointIds);
    if (pointsError) return fail(pointsError.message, 500);
    for (const point of points || []) pointsMap.set(Number(point.id), point);
  }

  return json({
    ok: true,
    data: (data || []).map((row) => ({
      ...row,
      punto_venta_nombre: row.punto_venta_id ? (pointsMap.get(Number(row.punto_venta_id))?.nombre || null) : null,
      punto_venta_tipo: row.punto_venta_id ? (pointsMap.get(Number(row.punto_venta_id))?.tipo || null) : null,
    })),
  });
}

async function handleUsersCreate(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);

  const nombre = data?.nombre?.trim();
  const username = data?.username?.trim();
  const password = data?.password;
  const rol = data?.rol;
  const puntoVentaId = data?.punto_venta_id ? Number(data.punto_venta_id) : null;

  if (!nombre || !username || !password || !rol) {
    return fail('nombre, username, password y rol son requeridos');
  }
  if (rol === 'CAJERO' && !puntoVentaId) return fail('Debe asignar un punto de venta al vendedor');

  if (puntoVentaId) {
    const point = await getPointById(admin, puntoVentaId);
    if (!point.activo) return fail('Punto de venta inactivo');
  }

  const email = data.email || `${username}@motosystem.local`;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authUser?.user) return fail(authError?.message || 'No se pudo crear el usuario');

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .insert({
      id: authUser.user.id,
      email,
      username,
      nombre,
      rol,
      activo: true,
      punto_venta_id: puntoVentaId,
    })
    .select('id')
    .single();

  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return fail(profileError.message);
  }
  return json({ ok: true, data: { id: profile.id } });
}

async function handleUsersUpdate(request, env, id) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);

  const { data: currentProfile, error: currentError } = await admin
    .from('user_profiles')
    .select('id, rol, punto_venta_id')
    .eq('id', id)
    .single();
  if (currentError || !currentProfile) return fail('Usuario no encontrado', 404);

  const nextRole = data.rol !== undefined ? data.rol : currentProfile.rol;
  const nextPointId = data.punto_venta_id !== undefined
    ? (data.punto_venta_id ? Number(data.punto_venta_id) : null)
    : currentProfile.punto_venta_id;
  if (nextRole === 'CAJERO' && !nextPointId) return fail('Debe asignar un punto de venta al vendedor');
  if (nextPointId) {
    const point = await getPointById(admin, nextPointId);
    if (!point.activo) return fail('Punto de venta inactivo');
  }

  const profilePatch = {};
  if (data.nombre !== undefined) profilePatch.nombre = data.nombre;
  if (data.rol !== undefined) profilePatch.rol = data.rol;
  if (data.activo !== undefined) profilePatch.activo = !!data.activo;
  if (data.punto_venta_id !== undefined) profilePatch.punto_venta_id = nextPointId;
  if (data.activo === false) {
    profilePatch.sesion_activa_id = null;
    profilePatch.sesion_activa_actualizada_en = null;
  }

  if (Object.keys(profilePatch).length) {
    const { error } = await admin.from('user_profiles').update(profilePatch).eq('id', id);
    if (error) return fail(error.message);
  }

  if (data.password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: data.password });
    if (error) return fail(error.message);
  }

  return json({ ok: true });
}

async function handlePointsList(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data, error } = await admin
    .from('puntos_venta')
    .select('id, nombre, codigo, tipo, activo, creado_en')
    .order('tipo', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) return fail(error.message, 500);
  return json({ ok: true, data });
}

async function handlePointsCreate(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const nombre = (data?.nombre || '').trim();
  if (!nombre) return fail('Nombre requerido');

  const payload = {
    nombre,
    codigo: normalizePointCode(nombre, data?.codigo),
    tipo: POINT_TYPES.POS,
    activo: true,
  };

  const { data: created, error } = await admin.from('puntos_venta').insert(payload).select('id').single();
  if (error) return fail(error.message);
  return json({ ok: true, data: { id: created.id } });
}

async function handlePointsUpdate(request, env, id) {
  const { admin } = await requireSupervisor(request, env);
  const point = await getPointById(admin, id);
  const { data } = await readJson(request);

  if (point.tipo === POINT_TYPES.CENTRAL && data?.activo === false) {
    return fail('El almacen central no puede desactivarse');
  }

  const patch = {};
  if (data.nombre !== undefined) patch.nombre = data.nombre?.trim();
  if (data.codigo !== undefined || data.nombre !== undefined) {
    patch.codigo = normalizePointCode(data?.nombre || point.nombre, data?.codigo ?? point.codigo);
  }
  if (data.activo !== undefined) patch.activo = !!data.activo;

  const { error } = await admin.from('puntos_venta').update(patch).eq('id', Number(id));
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleBrandsList(request, env) {
  const { admin } = await requireAuth(request, env);
  const { data, error } = await admin.from('marcas').select('id, nombre, activo, creado_en').order('nombre');
  if (error) return fail(error.message, 500);
  return json({ ok: true, data });
}

async function handleBrandsCreate(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const nombre = (data?.nombre || '').trim();
  if (!nombre) return fail('Nombre requerido');
  const { data: created, error } = await admin.from('marcas').insert({ nombre }).select('id').single();
  if (error) return fail(error.message);
  return json({ ok: true, data: { id: created.id } });
}

async function handleBrandsUpdate(request, env, id) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const patch = {};
  if (data.nombre !== undefined) patch.nombre = data.nombre?.trim();
  if (data.activo !== undefined) patch.activo = !!data.activo;
  const { error } = await admin.from('marcas').update(patch).eq('id', id);
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleBrandsDelete(request, env, id) {
  const { admin } = await requireSupervisor(request, env);
  const { error } = await admin.from('marcas').update({ activo: false }).eq('id', id);
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleInventoryList(request, env, kind) {
  const { admin, profile } = await requireAuth(request, env);
  const url = new URL(request.url);
  const buscar = url.searchParams.get('buscar');
  const soloStock = url.searchParams.get('soloStock') === 'true';
  const requestedScope = url.searchParams.get('scope');
  const requestedPointId = url.searchParams.get('punto_venta_id');

  try {
    const inventoryScope = await resolveInventoryScope({
      admin,
      profile,
      requestedScope,
      requestedPointId,
    });
    const data = await listInventoryRows({
      admin,
      kind,
      buscar,
      soloStock,
      scope: inventoryScope.scope,
      pointId: inventoryScope.pointId,
    });
    return json({
      ok: true,
      data,
      meta: {
        scope: inventoryScope.scope,
        punto_venta_id: inventoryScope.pointId,
        punto_venta_nombre: inventoryScope.point.nombre,
      },
    });
  } catch (error) {
    return fail(error.message, error.message.includes('Supervisor') || error.message.includes('No autorizado') ? 403 : 400);
  }
}

async function handleInventoryCreate(request, env, kind) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const { marca_id, marca_nombre } = await resolveMarca(admin, data, kind === 'motos' || kind === 'motos_e');
  const stocks = normalizeStocks(data);
  validatePricing(data);

  const payload = {
    ...data,
    ...stocks,
    marca_id,
    marca: marca_nombre,
  };

  const { data: created, error } = await admin.from(kind).insert(payload).select('id').single();
  if (error) return fail(error.message);
  return json({ ok: true, data: { id: created.id } });
}

async function handleInventoryUpdate(request, env, kind, id) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const patch = { ...data };

  if (data.marca_id !== undefined || data.marca !== undefined) {
    const { marca_id, marca_nombre } = await resolveMarca(admin, data, kind === 'motos' || kind === 'motos_e');
    patch.marca_id = marca_id;
    patch.marca = marca_nombre;
  }

  if (
    data.precio !== undefined ||
    data.precio_final !== undefined ||
    data.costo !== undefined ||
    data.precio_venta !== undefined ||
    data.descuento_maximo_pct !== undefined
  ) {
    validatePricing(kind === 'motos' || kind === 'motos_e'
      ? {
          costo: data.costo ?? 0,
          precio_venta: data.precio_venta ?? 0,
          descuento_maximo_pct: data.descuento_maximo_pct ?? 0,
        }
      : {
          precio: data.precio ?? 0,
          precio_final: data.precio_final ?? 0,
          descuento_maximo_pct: data.descuento_maximo_pct ?? 0,
        });
  }

  if (
    data.cantidad_libre !== undefined ||
    data.cantidad_reservada !== undefined ||
    data.cantidad_vendida !== undefined
  ) {
    Object.assign(patch, normalizeStocks(data));
  }

  const { error } = await admin.from(kind).update(patch).eq('id', id);
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleInventoryDelete(request, env, kind, id) {
  const { admin } = await requireSupervisor(request, env);
  const { error } = await admin.from(kind).update({ activo: false }).eq('id', id);
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleInventoryReport(request, env) {
  const { admin, profile } = await requireAuth(request, env);
  const url = new URL(request.url);
  const inventoryScope = await resolveInventoryScope({
    admin,
    profile,
    requestedScope: url.searchParams.get('scope'),
    requestedPointId: url.searchParams.get('punto_venta_id'),
  });
  const result = {};

  for (const table of PRODUCT_TABLES) {
    const data = await listInventoryRows({
      admin,
      kind: table,
      buscar: null,
      soloStock: false,
      scope: inventoryScope.scope,
      pointId: inventoryScope.pointId,
    });

    result[table] = {
      items: data || [],
      total_unidades: (data || []).reduce((sum, row) => sum + Number(row.cantidad_libre || 0), 0),
      total_reservadas: (data || []).reduce((sum, row) => sum + Number(row.cantidad_reservada || 0), 0),
      total_vendidas: (data || []).reduce((sum, row) => sum + Number(row.cantidad_vendida || 0), 0),
      valor_total: (data || []).reduce((sum, row) => sum + Number(row.costo ?? row.precio ?? 0) * Number(row.cantidad_libre || 0), 0),
    };
  }

  return json({
    ok: true,
    data: result,
    meta: {
      scope: inventoryScope.scope,
      punto_venta_id: inventoryScope.pointId,
      punto_venta_nombre: inventoryScope.point.nombre,
    },
  });
}

async function handleInventoryTransfer(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const { data } = await readJson(request);
  const kind = data?.kind;
  const productId = Number(data?.product_id);
  const centralPoint = await getCentralPoint(admin);
  const sourcePointId = Number(data?.source_point_id ?? data?.origen_punto_venta_id ?? data?.sourcePointId ?? centralPoint.id);
  const destinationPointId = Number(data?.destination_point_id ?? data?.destino_punto_venta_id ?? data?.destinationPointId ?? data?.punto_venta_id);
  const quantity = Number(data?.cantidad);

  if (!PRODUCT_TABLES.includes(kind)) return fail('Tipo de inventario no soportado');
  if (!Number.isFinite(productId) || productId <= 0) return fail('Producto invalido');
  if (!Number.isFinite(sourcePointId) || sourcePointId <= 0) return fail('Origen invalido');
  if (!Number.isFinite(destinationPointId) || destinationPointId <= 0) return fail('Destino invalido');
  if (!Number.isFinite(quantity) || quantity <= 0) return fail('Cantidad invalida');
  if (sourcePointId === destinationPointId) return fail('El origen y el destino no pueden ser iguales');

  const sourcePoint = await getPointById(admin, sourcePointId);
  const destinationPoint = await getPointById(admin, destinationPointId);
  if (!sourcePoint.activo) return fail('Ubicacion origen inactiva');
  if (!destinationPoint.activo) return fail('Ubicacion destino inactiva');

  const { data: product, error: productError } = await admin
    .from(kind)
    .select('id, activo, cantidad_libre')
    .eq('id', productId)
    .single();
  if (productError || !product || !product.activo) return fail('Producto no encontrado', 404);

  if (sourcePoint.tipo === POINT_TYPES.CENTRAL) {
    if (Number(product.cantidad_libre || 0) < quantity) return fail('Stock insuficiente en almacen central');
    const { error } = await admin
      .from(kind)
      .update({
        cantidad_libre: Number(product.cantidad_libre || 0) - quantity,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', productId)
      .gte('cantidad_libre', quantity);
    if (error) return fail(error.message);
  } else {
    const { data: sourceStock, error: sourceStockError } = await admin
      .from('inventario_puntos_venta')
      .select('id, cantidad_libre')
      .eq('punto_venta_id', sourcePointId)
      .eq('producto_tipo', kind)
      .eq('producto_id', productId)
      .maybeSingle();
    if (sourceStockError) return fail(sourceStockError.message);
    if (!sourceStock || Number(sourceStock.cantidad_libre || 0) < quantity) {
      return fail('Stock insuficiente en la ubicacion origen');
    }

    const { error } = await admin
      .from('inventario_puntos_venta')
      .update({
        cantidad_libre: Number(sourceStock.cantidad_libre || 0) - quantity,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', sourceStock.id);
    if (error) return fail(error.message);
  }

  if (destinationPoint.tipo === POINT_TYPES.CENTRAL) {
    const { error } = await admin
      .from(kind)
      .update({
        cantidad_libre: Number(product.cantidad_libre || 0) + quantity,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', productId);
    if (error) return fail(error.message);
  } else {
    const { data: destinationStock, error: destinationStockError } = await admin
      .from('inventario_puntos_venta')
      .select('id, cantidad_libre')
      .eq('punto_venta_id', destinationPointId)
      .eq('producto_tipo', kind)
      .eq('producto_id', productId)
      .maybeSingle();
    if (destinationStockError) return fail(destinationStockError.message);

    if (destinationStock?.id) {
      const { error } = await admin
        .from('inventario_puntos_venta')
        .update({
          cantidad_libre: Number(destinationStock.cantidad_libre || 0) + quantity,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', destinationStock.id);
      if (error) return fail(error.message);
    } else {
      const { error } = await admin
        .from('inventario_puntos_venta')
        .insert({
          punto_venta_id: destinationPointId,
          producto_tipo: kind,
          producto_id: productId,
          cantidad_libre: quantity,
          cantidad_reservada: 0,
          cantidad_vendida: 0,
        });
      if (error) return fail(error.message);
    }
  }

  return json({ ok: true });
}

async function upsertMotoFromCsv(admin, data) {
  const { data: existing } = await admin.from('motos').select('id').eq('chasis', data.chasis).maybeSingle();

  if (existing) {
    const { error } = await admin.from('motos').update({
      marca_id: data.marca_id,
      marca: data.marca,
      ano: data.ano,
      tipo: data.tipo,
      color: data.color,
      cilindrada: data.cilindrada,
      motor: data.motor,
      costo: data.costo,
      precio_venta: data.precio_venta,
      descuento_maximo_pct: data.descuento_maximo_pct,
      cantidad_libre: data.cantidad_libre,
      activo: true,
    }).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return 'updated';
  }

  const { error } = await admin.from('motos').insert({
    marca_id: data.marca_id,
    marca: data.marca,
    ano: data.ano,
    tipo: data.tipo,
    color: data.color,
    chasis: data.chasis,
    cilindrada: data.cilindrada,
    motor: data.motor,
    costo: data.costo,
    precio_venta: data.precio_venta,
    descuento_maximo_pct: data.descuento_maximo_pct,
    cantidad_libre: data.cantidad_libre,
    cantidad_reservada: 0,
    cantidad_vendida: 0,
  });
  if (error) throw new Error(error.message);
  return 'inserted';
}

async function upsertMotoEFromCsv(admin, data) {
  const { data: existing } = await admin.from('motos_e').select('id').eq('chasis', data.chasis).maybeSingle();

  if (existing) {
    const { error } = await admin.from('motos_e').update({
      marca_id: data.marca_id,
      marca: data.marca,
      ano: data.ano,
      tipo: data.tipo,
      color: data.color,
      potencia: data.potencia,
      motor: data.motor,
      costo: data.costo,
      precio_venta: data.precio_venta,
      descuento_maximo_pct: data.descuento_maximo_pct,
      cantidad_libre: data.cantidad_libre,
      activo: true,
    }).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return 'updated';
  }

  const { error } = await admin.from('motos_e').insert({
    marca_id: data.marca_id,
    marca: data.marca,
    ano: data.ano,
    tipo: data.tipo,
    color: data.color,
    chasis: data.chasis,
    potencia: data.potencia,
    motor: data.motor,
    costo: data.costo,
    precio_venta: data.precio_venta,
    descuento_maximo_pct: data.descuento_maximo_pct,
    cantidad_libre: data.cantidad_libre,
    cantidad_reservada: 0,
    cantidad_vendida: 0,
  });
  if (error) throw new Error(error.message);
  return 'inserted';
}

async function findAccessoryLike(admin, data) {
  let query = admin.from('accesorios').select('id').eq('tipo', data.tipo).limit(1);
  query = data.marca === null ? query.is('marca', null) : query.eq('marca', data.marca);
  query = data.color === null ? query.is('color', null) : query.eq('color', data.color);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  return rows?.[0] || null;
}

async function upsertAccesorioFromCsv(admin, data) {
  const existing = await findAccessoryLike(admin, data);
  if (existing) {
    const { error } = await admin.from('accesorios').update({
      marca_id: data.marca_id,
      marca: data.marca,
      tipo: data.tipo,
      color: data.color,
      precio: data.precio,
      precio_final: data.precio_final,
      descuento_maximo_pct: data.descuento_maximo_pct,
      cantidad_libre: data.cantidad_libre,
      activo: true,
    }).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return 'updated';
  }

  const { error } = await admin.from('accesorios').insert({
    marca_id: data.marca_id,
    marca: data.marca,
    tipo: data.tipo,
    color: data.color,
    precio: data.precio,
    precio_final: data.precio_final,
    descuento_maximo_pct: data.descuento_maximo_pct,
    cantidad_libre: data.cantidad_libre,
    cantidad_reservada: 0,
    cantidad_vendida: 0,
  });
  if (error) throw new Error(error.message);
  return 'inserted';
}

async function findRepuestoLike(admin, data) {
  let query = admin.from('repuestos').select('id').eq('tipo', data.tipo).limit(1);
  query = data.marca === null ? query.is('marca', null) : query.eq('marca', data.marca);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  return rows?.[0] || null;
}

async function upsertRepuestoFromCsv(admin, data) {
  const existing = await findRepuestoLike(admin, data);
  if (existing) {
    const { error } = await admin.from('repuestos').update({
      marca_id: data.marca_id,
      marca: data.marca,
      tipo: data.tipo,
      precio: data.precio,
      precio_final: data.precio_final,
      descuento_maximo_pct: data.descuento_maximo_pct,
      cantidad_libre: data.cantidad_libre,
      activo: true,
    }).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return 'updated';
  }

  const { error } = await admin.from('repuestos').insert({
    marca_id: data.marca_id,
    marca: data.marca,
    tipo: data.tipo,
    precio: data.precio,
    precio_final: data.precio_final,
    descuento_maximo_pct: data.descuento_maximo_pct,
    cantidad_libre: data.cantidad_libre,
    cantidad_reservada: 0,
    cantidad_vendida: 0,
  });
  if (error) throw new Error(error.message);
  return 'inserted';
}

async function importInventoryCsv(request, env, kind) {
  const { admin } = await requireSupervisor(request, env);
  const { csvText } = await readJson(request);
  const { header, rows } = parseCsv(csvText);

  let inserted = 0;
  let updated = 0;

  if (kind === 'motos') {
    requireColumns(header, ['marca', 'ano', 'tipo', 'color', 'chasis', 'cilindrada', 'motor', 'costo', 'precio_venta', 'descuento_maximo_pct', 'cantidad_libre']);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rowObject(header, rows[index]);
      const { marca_id, marca_nombre } = await resolveMarca(admin, { marca: row.marca }, true);
      const data = {
        marca_id,
        marca: marca_nombre,
        ano: row.ano,
        tipo: textOrNull(row.tipo),
        color: textOrNull(row.color),
        chasis: row.chasis,
        cilindrada: textOrNull(row.cilindrada),
        motor: textOrNull(row.motor),
        costo: requiredNumber(row.costo, 'costo'),
        precio_venta: requiredNumber(row.precio_venta, 'precio_venta'),
        descuento_maximo_pct: requiredNumber(row.descuento_maximo_pct, 'descuento_maximo_pct'),
        cantidad_libre: numberOrZero(row.cantidad_libre),
      };

      if (!data.marca || !data.ano || !data.chasis) throw new Error(`Fila ${index + 2}: campos requeridos faltantes`);
      validatePricing(data);
      const operation = await upsertMotoFromCsv(admin, data);
      if (operation === 'inserted') inserted += 1;
      else updated += 1;
    }
  }

  if (kind === 'motos_e') {
    requireColumns(header, ['marca', 'ano', 'tipo', 'color', 'chasis', 'potencia', 'motor', 'costo', 'precio_venta', 'descuento_maximo_pct', 'cantidad_libre']);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rowObject(header, rows[index]);
      const { marca_id, marca_nombre } = await resolveMarca(admin, { marca: row.marca }, true);
      const data = {
        marca_id,
        marca: marca_nombre,
        ano: row.ano,
        tipo: textOrNull(row.tipo),
        color: textOrNull(row.color),
        chasis: row.chasis,
        potencia: textOrNull(row.potencia),
        motor: textOrNull(row.motor),
        costo: requiredNumber(row.costo, 'costo'),
        precio_venta: requiredNumber(row.precio_venta, 'precio_venta'),
        descuento_maximo_pct: requiredNumber(row.descuento_maximo_pct, 'descuento_maximo_pct'),
        cantidad_libre: numberOrZero(row.cantidad_libre),
      };

      if (!data.marca || !data.ano || !data.chasis) throw new Error(`Fila ${index + 2}: campos requeridos faltantes`);
      validatePricing(data);
      const operation = await upsertMotoEFromCsv(admin, data);
      if (operation === 'inserted') inserted += 1;
      else updated += 1;
    }
  }

  if (kind === 'accesorios') {
    requireColumns(header, ['marca', 'tipo', 'color', 'precio', 'precio_final', 'descuento_maximo_pct', 'cantidad_libre']);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rowObject(header, rows[index]);
      const { marca_id, marca_nombre } = await resolveMarca(admin, { marca: row.marca }, false);
      const data = {
        marca_id,
        marca: marca_nombre,
        tipo: row.tipo,
        color: textOrNull(row.color),
        precio: requiredNumber(row.precio, 'precio'),
        precio_final: requiredNumber(row.precio_final, 'precio_final'),
        descuento_maximo_pct: requiredNumber(row.descuento_maximo_pct, 'descuento_maximo_pct'),
        cantidad_libre: numberOrZero(row.cantidad_libre),
      };

      if (!data.tipo) throw new Error(`Fila ${index + 2}: tipo requerido`);
      validatePricing(data);
      const operation = await upsertAccesorioFromCsv(admin, data);
      if (operation === 'inserted') inserted += 1;
      else updated += 1;
    }
  }

  if (kind === 'repuestos') {
    requireColumns(header, ['marca', 'tipo', 'precio', 'precio_final', 'descuento_maximo_pct', 'cantidad_libre']);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rowObject(header, rows[index]);
      const { marca_id, marca_nombre } = await resolveMarca(admin, { marca: row.marca }, false);
      const data = {
        marca_id,
        marca: marca_nombre,
        tipo: row.tipo,
        precio: requiredNumber(row.precio, 'precio'),
        precio_final: requiredNumber(row.precio_final, 'precio_final'),
        descuento_maximo_pct: requiredNumber(row.descuento_maximo_pct, 'descuento_maximo_pct'),
        cantidad_libre: numberOrZero(row.cantidad_libre),
      };

      if (!data.tipo) throw new Error(`Fila ${index + 2}: tipo requerido`);
      validatePricing(data);
      const operation = await upsertRepuestoFromCsv(admin, data);
      if (operation === 'inserted') inserted += 1;
      else updated += 1;
    }
  }

  return json({ ok: true, data: { inserted, updated } });
}

async function expireQuotes(admin) {
  const { error } = await admin.rpc('expire_proformas');
  if (error) throw new Error(error.message);
}

async function handleQuotesList(request, env) {
  const { admin, profile } = await requireAuth(request, env);
  await expireQuotes(admin);

  const url = new URL(request.url);
  const estado = url.searchParams.get('estado');
  const fecha = url.searchParams.get('fecha');
  const numero = url.searchParams.get('numero');

  let query = admin
    .from('proformas')
    .select('id, codigo, cliente_nombre, cliente_ci_nit, cliente_celular, fecha_creacion, fecha_expiracion, subtotal, total_descuentos, total, estado, notas, vendedor_id, punto_venta_id, user_profiles!proformas_vendedor_id_fkey(nombre)')
    .order('fecha_creacion', { ascending: false });

  if (estado) query = query.eq('estado', estado);
  if (fecha) {
    query = query
      .gte('fecha_creacion', `${fecha}T00:00:00`)
      .lte('fecha_creacion', `${fecha}T23:59:59`);
  }
  if (numero) query = query.ilike('codigo', `%${numero}%`);
  if (profile.rol !== 'SUPERVISOR') query = query.eq('vendedor_id', profile.id);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const pointIds = [...new Set((data || []).map((row) => row.punto_venta_id).filter(Boolean))];
  const pointsMap = new Map();
  if (pointIds.length) {
    const { data: points, error: pointsError } = await admin.from('puntos_venta').select('id, nombre').in('id', pointIds);
    if (pointsError) return fail(pointsError.message, 500);
    for (const point of points || []) pointsMap.set(Number(point.id), point.nombre);
  }

  return json({
    ok: true,
    data: (data || []).map((row) => ({
      ...row,
      vendedor_nombre: row.user_profiles?.nombre ?? null,
      punto_venta_nombre: row.punto_venta_id ? (pointsMap.get(Number(row.punto_venta_id)) || null) : null,
      user_profiles: undefined,
    })),
  });
}

async function handleQuotesGet(request, env, id) {
  const { admin, profile } = await requireAuth(request, env);
  await expireQuotes(admin);

  let query = admin
    .from('proformas')
    .select('id, codigo, cliente_nombre, cliente_ci_nit, cliente_celular, fecha_creacion, fecha_expiracion, subtotal, total_descuentos, total, estado, notas, vendedor_id, punto_venta_id, user_profiles!proformas_vendedor_id_fkey(nombre)')
    .eq('id', id);
  if (profile.rol !== 'SUPERVISOR') query = query.eq('vendedor_id', profile.id);
  const { data: proforma, error: proformaError } = await query.single();

  if (proformaError || !proforma) return fail('Proforma no encontrada', 404);

  const { data: items, error: itemsError } = await admin
    .from('proforma_items')
    .select('*')
    .eq('proforma_id', id)
    .order('id');

  if (itemsError) return fail(itemsError.message, 500);

  return json({
    ok: true,
    data: {
      ...proforma,
      vendedor_nombre: proforma.user_profiles?.nombre ?? null,
      punto_venta_nombre: proforma.punto_venta_id ? (await getPointById(admin, proforma.punto_venta_id)).nombre : null,
      user_profiles: undefined,
      items: items || [],
    },
  });
}

async function handleQuotesCreate(request, env) {
  const { profile, admin } = await requireAuth(request, env);
  const { data } = await readJson(request);

  const { data: createdId, error } = await admin.rpc('create_proforma', {
    p_vendedor_id: profile.id,
    p_cliente_nombre: data.cliente_nombre,
    p_cliente_ci_nit: data.cliente_ci_nit,
    p_cliente_celular: data.cliente_celular,
    p_items: data.items,
    p_fecha_limite: data.fecha_limite ? `${data.fecha_limite}T23:59:59Z` : null,
    p_dias_vigencia: data.dias_vigencia ?? 7,
    p_notas: data.notas ?? null,
  });

  if (error) return fail(error.message);
  return json({ ok: true, data: { id: createdId } });
}

async function handleQuotesCancel(request, env, id) {
  const { admin } = await requireAuth(request, env);
  const { error } = await admin.rpc('cancel_proforma', { p_id: Number(id) });
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleSalesList(request, env) {
  const { admin, profile } = await requireAuth(request, env);
  let query = admin
    .from('ventas')
    .select('id, codigo, proforma_id, vendedor_id, punto_venta_id, cliente_nombre, cliente_ci_nit, cliente_celular, subtotal, total_descuentos, total, estado, notas, fecha_venta, user_profiles!ventas_vendedor_id_fkey(nombre)')
    .order('fecha_venta', { ascending: false });
  if (profile.rol !== 'SUPERVISOR') query = query.eq('vendedor_id', profile.id);
  const { data, error } = await query;

  if (error) return fail(error.message, 500);
  const pointIds = [...new Set((data || []).map((row) => row.punto_venta_id).filter(Boolean))];
  const pointsMap = new Map();
  if (pointIds.length) {
    const { data: points, error: pointsError } = await admin.from('puntos_venta').select('id, nombre').in('id', pointIds);
    if (pointsError) return fail(pointsError.message, 500);
    for (const point of points || []) pointsMap.set(Number(point.id), point.nombre);
  }
  return json({
    ok: true,
    data: (data || []).map((row) => ({
      ...row,
      vendedor_nombre: row.user_profiles?.nombre ?? null,
      punto_venta_nombre: row.punto_venta_id ? (pointsMap.get(Number(row.punto_venta_id)) || null) : null,
      user_profiles: undefined,
    })),
  });
}

async function handleSalesGet(request, env, id) {
  const { admin, profile } = await requireAuth(request, env);
  let query = admin
    .from('ventas')
    .select('id, codigo, proforma_id, vendedor_id, punto_venta_id, cliente_nombre, cliente_ci_nit, cliente_celular, subtotal, total_descuentos, total, estado, notas, fecha_venta, user_profiles!ventas_vendedor_id_fkey(nombre)')
    .eq('id', id);
  if (profile.rol !== 'SUPERVISOR') query = query.eq('vendedor_id', profile.id);
  const { data: venta, error: ventaError } = await query.single();

  if (ventaError || !venta) return fail('Venta no encontrada', 404);

  const { data: items, error: itemsError } = await admin
    .from('venta_items')
    .select('*')
    .eq('venta_id', id)
    .order('id');
  if (itemsError) return fail(itemsError.message, 500);

  const { data: tramites, error: tramitesError } = await admin
    .from('tramites')
    .select('*')
    .in('venta_item_id', (items || []).map((item) => item.id));
  if (tramitesError) return fail(tramitesError.message, 500);

  return json({
    ok: true,
    data: {
      ...venta,
      vendedor_nombre: venta.user_profiles?.nombre ?? null,
      punto_venta_nombre: venta.punto_venta_id ? (await getPointById(admin, venta.punto_venta_id)).nombre : null,
      user_profiles: undefined,
      items: items || [],
      tramites: tramites || [],
    },
  });
}

async function handleSalesCreate(request, env) {
  const { profile, admin } = await requireAuth(request, env);
  const { data } = await readJson(request);

  if (!data.proforma_id) {
    const { data: createdId, error } = await admin.rpc('create_direct_sale', {
      p_vendedor_id: profile.id,
      p_cliente_nombre: data.cliente_nombre,
      p_cliente_ci_nit: data.cliente_ci_nit,
      p_cliente_celular: data.cliente_celular,
      p_items: data.items,
      p_notas: data.notas ?? null,
    });

    if (error) return fail(error.message);
    return json({ ok: true, data: { id: createdId } });
  }

  const { data: createdId, error } = await admin.rpc('create_sale_from_proforma', {
    p_vendedor_id: profile.id,
    p_proforma_id: Number(data.proforma_id),
    p_tramites: data.tramites ?? [],
    p_notas: data.notas ?? null,
  });

  if (error) return fail(error.message);
  return json({ ok: true, data: { id: createdId } });
}

async function handleSalesCancel(request, env, id) {
  const { admin } = await requireSupervisor(request, env);
  const { error } = await admin.rpc('cancel_sale', { p_sale_id: Number(id) });
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleTramitesList(request, env) {
  const { admin } = await requireAuth(request, env);
  const url = new URL(request.url);
  const estado = url.searchParams.get('estado');

  let query = admin
    .from('tramites')
    .select('id, venta_item_id, tipo, nombre, marca, costo_total, cobro_en_venta, a_cuenta, saldo, estado, observaciones, creado_en, actualizado_en, venta_items!inner(id, moto_id, motos(marca, ano))')
    .order('creado_en', { ascending: false });

  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  return json({
    ok: true,
    data: (data || []).map((row) => ({
      ...row,
      moto_marca: row.venta_items?.motos?.marca ?? null,
      moto_modelo: row.venta_items?.motos?.ano ?? null,
      venta_items: undefined,
    })),
  });
}

async function handleTramitesCreate(request, env) {
  const { admin } = await requireAuth(request, env);
  const { data } = await readJson(request);

  const { data: ventaItem, error: ventaItemError } = await admin
    .from('venta_items')
    .select('id, moto_id')
    .eq('id', Number(data.venta_item_id))
    .single();

  if (ventaItemError || !ventaItem) return fail('Venta item no encontrado', 404);
  if (!ventaItem.moto_id) return fail('Los tramites solo aplican a items de moto');

  const cobroEnVenta = !!data.cobro_en_venta;
  const costoTotal = Number(data.costo_total ?? 0);
  const aCuenta = cobroEnVenta ? null : Number(data.a_cuenta ?? 0);
  const saldo = cobroEnVenta ? null : costoTotal - aCuenta;

  const payload = {
    venta_item_id: Number(data.venta_item_id),
    tipo: data.tipo,
    nombre: data.nombre,
    marca: data.marca ?? null,
    costo_total: costoTotal,
    cobro_en_venta: cobroEnVenta,
    a_cuenta: cobroEnVenta ? null : aCuenta,
    saldo: cobroEnVenta ? null : saldo,
    estado: data.estado ?? 'PENDIENTE',
    observaciones: data.observaciones ?? null,
  };

  const { data: created, error } = await admin.from('tramites').insert(payload).select('id').single();
  if (error) return fail(error.message);
  return json({ ok: true, data: { id: created.id } });
}

async function handleTramitesUpdate(request, env, id) {
  const { admin } = await requireAuth(request, env);
  const body = await readJson(request);
  const payload = body.data || {};
  const { data: current, error: currentError } = await admin.from('tramites').select('*').eq('id', Number(id)).single();
  if (currentError || !current) return fail('Tramite no encontrado', 404);

  const patch = {};
  if (payload.estado !== undefined) patch.estado = payload.estado;
  if (payload.observaciones !== undefined) patch.observaciones = payload.observaciones ?? null;
  const cobroEnVenta = payload.cobro_en_venta !== undefined ? !!payload.cobro_en_venta : current.cobro_en_venta;
  const costoTotal = payload.costo_total !== undefined ? Number(payload.costo_total) : Number(current.costo_total);
  const aCuenta = cobroEnVenta ? null : (payload.a_cuenta !== undefined ? Number(payload.a_cuenta) : Number(current.a_cuenta ?? 0));
  const saldo = cobroEnVenta ? null : costoTotal - aCuenta;

  if (payload.cobro_en_venta !== undefined) patch.cobro_en_venta = cobroEnVenta;
  if (payload.costo_total !== undefined) patch.costo_total = costoTotal;
  patch.a_cuenta = cobroEnVenta ? null : aCuenta;
  patch.saldo = cobroEnVenta ? null : saldo;

  const { error } = await admin.from('tramites').update(patch).eq('id', Number(id));
  if (error) return fail(error.message);
  return json({ ok: true });
}

async function handleSalesReport(request, env) {
  const { admin, profile } = await requireAuth(request, env);
  const url = new URL(request.url);
  const fechaInicio = url.searchParams.get('fechaInicio');
  const fechaFin = url.searchParams.get('fechaFin');
  const usuarioId = profile.rol === 'CAJERO' ? profile.id : url.searchParams.get('usuario_id');
  const tipoProducto = url.searchParams.get('tipo_producto');

  let query = admin
    .from('ventas')
    .select('id, codigo, vendedor_id, punto_venta_id, cliente_nombre, subtotal, total_descuentos, total, estado, fecha_venta, user_profiles!ventas_vendedor_id_fkey(nombre), venta_items!inner(moto_id, accesorio_id, repuesto_id)')
    .order('fecha_venta', { ascending: false });

  if (fechaInicio) query = query.gte('fecha_venta', `${fechaInicio}T00:00:00`);
  if (fechaFin) query = query.lte('fecha_venta', `${fechaFin}T23:59:59`);
  if (usuarioId) query = query.eq('vendedor_id', usuarioId);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const pointIds = [...new Set((data || []).map((row) => row.punto_venta_id).filter(Boolean))];
  const pointsMap = new Map();
  if (pointIds.length) {
    const { data: points, error: pointsError } = await admin.from('puntos_venta').select('id, nombre').in('id', pointIds);
    if (pointsError) return fail(pointsError.message, 500);
    for (const point of points || []) pointsMap.set(Number(point.id), point.nombre);
  }

  let ventas = (data || []).map((row) => ({
    ...row,
    vendedor_nombre: row.user_profiles?.nombre ?? null,
    punto_venta_nombre: row.punto_venta_id ? (pointsMap.get(Number(row.punto_venta_id)) || null) : null,
  }));

  if (tipoProducto) {
    ventas = ventas.filter((row) =>
      (row.venta_items || []).some((item) => (
        (tipoProducto === 'moto' && item.moto_id) ||
        (tipoProducto === 'accesorio' && item.accesorio_id) ||
        (tipoProducto === 'repuesto' && item.repuesto_id)
      ))
    );
  }

  const totals = ventas.reduce((acc, row) => {
    acc.subtotal += Number(row.subtotal || 0);
    acc.descuentos += Number(row.total_descuentos || 0);
    acc.total += Number(row.total || 0);
    return acc;
  }, { subtotal: 0, descuentos: 0, total: 0 });

  return json({
    ok: true,
    data: {
      ventas: ventas.map(({ user_profiles, venta_items, ...row }) => row),
      total_ventas: ventas.length,
      subtotal: totals.subtotal,
      total_descuentos: totals.descuentos,
      ingresos_totales: totals.total,
    },
  });
}

async function handleQuotesReport(request, env) {
  const { admin, profile } = await requireAuth(request, env);
  await expireQuotes(admin);
  const url = new URL(request.url);
  const fechaInicio = url.searchParams.get('fechaInicio');
  const fechaFin = url.searchParams.get('fechaFin');
  const usuarioId = profile.rol === 'CAJERO' ? profile.id : url.searchParams.get('usuario_id');
  const tipoProducto = url.searchParams.get('tipo_producto');

  let query = admin
    .from('proformas')
    .select('id, codigo, vendedor_id, punto_venta_id, cliente_nombre, subtotal, total_descuentos, total, estado, fecha_creacion, user_profiles!proformas_vendedor_id_fkey(nombre), proforma_items!inner(moto_id, accesorio_id, repuesto_id)')
    .order('fecha_creacion', { ascending: false });

  if (fechaInicio) query = query.gte('fecha_creacion', `${fechaInicio}T00:00:00`);
  if (fechaFin) query = query.lte('fecha_creacion', `${fechaFin}T23:59:59`);
  if (usuarioId) query = query.eq('vendedor_id', usuarioId);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const pointIds = [...new Set((data || []).map((row) => row.punto_venta_id).filter(Boolean))];
  const pointsMap = new Map();
  if (pointIds.length) {
    const { data: points, error: pointsError } = await admin.from('puntos_venta').select('id, nombre').in('id', pointIds);
    if (pointsError) return fail(pointsError.message, 500);
    for (const point of points || []) pointsMap.set(Number(point.id), point.nombre);
  }

  let proformas = (data || []).map((row) => ({
    ...row,
    vendedor_nombre: row.user_profiles?.nombre ?? null,
    punto_venta_nombre: row.punto_venta_id ? (pointsMap.get(Number(row.punto_venta_id)) || null) : null,
  }));

  if (tipoProducto) {
    proformas = proformas.filter((row) =>
      (row.proforma_items || []).some((item) => (
        (tipoProducto === 'moto' && item.moto_id) ||
        (tipoProducto === 'accesorio' && item.accesorio_id) ||
        (tipoProducto === 'repuesto' && item.repuesto_id)
      ))
    );
  }

  const totals = proformas.reduce((acc, row) => {
    acc.subtotal += Number(row.subtotal || 0);
    acc.descuentos += Number(row.total_descuentos || 0);
    acc.total += Number(row.total || 0);
    return acc;
  }, { subtotal: 0, descuentos: 0, total: 0 });

  return json({
    ok: true,
    data: {
      proformas: proformas.map(({ user_profiles, proforma_items, ...row }) => row),
      total_proformas: proformas.length,
      subtotal: totals.subtotal,
      total_descuentos: totals.descuentos,
      total: totals.total,
    },
  });
}

async function handleTramitesReport(request, env) {
  const response = await handleTramitesList(request, env);
  const payload = await response.clone().json();
  if (!payload.ok) return response;

  const tramites = payload.data;
  const saldoPendiente = tramites
    .filter((item) => item.estado !== 'COMPLETADO')
    .reduce((sum, item) => sum + Number(item.saldo || 0), 0);

  return json({
    ok: true,
    data: {
      tramites,
      total: tramites.length,
      saldo_pendiente: saldoPendiente,
    },
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(columns, rows) {
  const header = columns.join(',');
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  return `${header}\n${body}`;
}

async function handleBackupExport(request, env) {
  const { admin } = await requireSupervisor(request, env);
  const tables = ['puntos_venta', 'inventario_puntos_venta', 'user_profiles', 'config', 'marcas', 'motos', 'motos_e', 'accesorios', 'repuestos', 'proformas', 'proforma_items', 'ventas', 'venta_items', 'tramites'];
  const backup = {};

  for (const table of tables) {
    const { data, error } = await admin.from(table).select('*');
    if (error) return fail(error.message, 500);
    backup[table] = data || [];
  }

  return attachment(
    JSON.stringify({
      exported_at: new Date().toISOString(),
      source: 'moto-system-web',
      data: backup,
    }, null, 2),
    `moto-system-backup-${Date.now()}.json`,
    'application/json; charset=utf-8'
  );
}

async function handleManualExport() {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Manual Moto System</title>
  <style>
    body { font-family: Georgia, serif; margin: 40px; color: #111827; line-height: 1.5; }
    h1, h2, h3 { color: #0f172a; }
    .note { color: #475569; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Manual de Usuario - Moto System</h1>
  <p class="note">Version exportable web. Para una salida tipo PDF use imprimir desde el navegador.</p>
  <h2>Flujo recomendado</h2>
  <ol>
    <li>Configurar costos y usuarios.</li>
    <li>Cargar marcas e inventario.</li>
    <li>Crear proformas.</li>
    <li>Convertir proformas en ventas.</li>
    <li>Consultar reportes y generar respaldos.</li>
  </ol>
  <h2>Modulos</h2>
  <ul>
    <li>Dashboard</li>
    <li>Inventario</li>
    <li>Proformas</li>
    <li>Ventas</li>
    <li>Reportes</li>
    <li>Usuarios</li>
    <li>Perfil</li>
  </ul>
</body>
</html>`;

  return attachment(html, `manual-moto-system-${Date.now()}.html`, 'text/html; charset=utf-8');
}

async function handleQuoteExport(request, env, id) {
  const quoteResponse = await handleQuotesGet(request, env, id);
  const payload = await quoteResponse.clone().json();
  if (!payload.ok) return quoteResponse;
  const q = payload.data;

  const rows = (q.items || []).map((item) => `
    <tr>
      <td>${item.descripcion ?? ''}</td>
      <td>${item.cantidad ?? ''}</td>
      <td>${Number(item.precio_unitario_final ?? 0).toFixed(2)}</td>
      <td>${Number(item.descuento_pct ?? 0).toFixed(2)}</td>
      <td>${Number(item.subtotal ?? 0).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${q.codigo}</title>
  <style>
    body { font-family: Georgia, serif; margin: 32px; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
    h1, h2 { margin-bottom: 4px; }
    .meta { color: #475569; font-size: 12px; }
  </style>
</head>
<body>
  <h1>PROFORMA</h1>
  <div class="meta">N° ${q.codigo}</div>
  <div class="meta">Estado: ${q.estado}</div>
  <div class="meta">Creada: ${q.fecha_creacion}</div>
  <div class="meta">Vigente hasta: ${q.fecha_expiracion}</div>
  <div class="meta">Vendedor: ${q.vendedor_nombre ?? ''}</div>
  <h2>Cliente</h2>
  <div>${q.cliente_nombre}</div>
  <div class="meta">${q.cliente_ci_nit} · ${q.cliente_celular}</div>
  <table>
    <thead>
      <tr><th>Descripcion</th><th>Cantidad</th><th>P.Unit</th><th>Desc %</th><th>Subtotal</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Totales</h2>
  <div>Subtotal: ${Number(q.subtotal ?? 0).toFixed(2)}</div>
  <div>Descuentos: ${Number(q.total_descuentos ?? 0).toFixed(2)}</div>
  <div>Total: ${Number(q.total ?? 0).toFixed(2)}</div>
</body>
</html>`;

  return attachment(html, `${q.codigo}.html`, 'text/html; charset=utf-8');
}

async function handleInventoryExport(request, env, kind) {
  const { admin } = await requireSupervisor(request, env);
  const tableConfigs = {
    motos: { columns: ['Marca', 'Ano', 'Chasis', 'Stock', 'Precio de Venta'], map: (row) => [row.marca, row.ano, row.chasis, row.cantidad_libre, row.precio_venta] },
    motos_e: { columns: ['Marca', 'Ano', 'Chasis', 'Potencia', 'Stock', 'Precio de Venta'], map: (row) => [row.marca, row.ano, row.chasis, row.potencia ?? '', row.cantidad_libre, row.precio_venta] },
    accesorios: { columns: ['Tipo', 'Marca', 'Color', 'Stock', 'Precio Final'], map: (row) => [row.tipo, row.marca ?? '', row.color ?? '', row.cantidad_libre, row.precio_final] },
    repuestos: { columns: ['Tipo', 'Marca', 'Stock', 'Precio Final'], map: (row) => [row.tipo, row.marca ?? '', row.cantidad_libre, row.precio_final] },
  };

  if (kind === 'productos') {
    const rows = [];
    for (const table of ['motos', 'motos_e', 'accesorios', 'repuestos']) {
      const { data, error } = await admin.from(table).select('*').eq('activo', true);
      if (error) return fail(error.message, 500);

      for (const row of data || []) {
        rows.push([
          table === 'motos_e' ? 'moto-e' : table.slice(0, -1),
          row.marca ?? '',
          row.ano ?? row.modelo ?? '',
          row.tipo ?? '',
          row.color ?? '',
          row.chasis ?? '',
          row.cantidad_libre ?? 0,
          row.precio_venta ?? row.precio_final ?? 0,
        ]);
      }
    }

    return attachment(
      buildCsv(
        ['Categoria', 'Marca', 'Ano', 'Tipo', 'Color', 'Chasis', 'Stock', 'Precio Venta'],
        rows
      ),
      `productos-${Date.now()}.csv`,
      'text/csv; charset=utf-8'
    );
  }

  const config = tableConfigs[kind];
  const { data, error } = await admin.from(kind).select('*').eq('activo', true);
  if (error) return fail(error.message, 500);
  const csv = buildCsv(config.columns, (data || []).map(config.map));
  return attachment(csv, `${kind}-${Date.now()}.csv`, 'text/csv; charset=utf-8');
}

async function handleSalesReportExport(request, env) {
  const response = await handleSalesReport(request, env);
  const payload = await response.clone().json();
  if (!payload.ok) return response;
  const rows = payload.data.ventas || [];
  const csv = buildCsv(
    ['Fecha', 'Codigo', 'Vendedor', 'Cliente', 'Subtotal', 'Descuentos', 'Total', 'Estado'],
    rows.map((row) => [row.fecha_venta, row.codigo, row.vendedor_nombre, row.cliente_nombre, row.subtotal, row.total_descuentos, row.total, row.estado])
  );
  return attachment(csv, `reporte-ventas-${Date.now()}.csv`, 'text/csv; charset=utf-8');
}

async function handleQuotesReportExport(request, env) {
  const response = await handleQuotesReport(request, env);
  const payload = await response.clone().json();
  if (!payload.ok) return response;
  const rows = payload.data.proformas || [];
  const csv = buildCsv(
    ['Fecha', 'Codigo', 'Vendedor', 'Cliente', 'Subtotal', 'Descuentos', 'Total', 'Estado'],
    rows.map((row) => [row.fecha_creacion, row.codigo, row.vendedor_nombre, row.cliente_nombre, row.subtotal, row.total_descuentos, row.total, row.estado])
  );
  return attachment(csv, `reporte-proformas-${Date.now()}.csv`, 'text/csv; charset=utf-8');
}

async function handleTramitesReportExport(request, env) {
  const response = await handleTramitesReport(request, env);
  const payload = await response.clone().json();
  if (!payload.ok) return response;
  const rows = payload.data.tramites || [];
  const csv = buildCsv(
    ['Creado', 'Tipo', 'Nombre', 'Marca', 'Moto', 'Estado', 'Costo Total', 'A Cuenta', 'Saldo'],
    rows.map((row) => [
      row.creado_en,
      row.tipo,
      row.nombre,
      row.marca ?? '',
      `${row.moto_marca ?? ''} ${row.moto_modelo ?? ''}`.trim(),
      row.estado,
      row.costo_total,
      row.a_cuenta ?? '',
      row.saldo ?? '',
    ])
  );
  return attachment(csv, `reporte-tramites-${Date.now()}.csv`, 'text/csv; charset=utf-8');
}

function notMigrated(name) {
  return json({ ok: false, error: `${name} aun no fue migrado al backend web` }, { status: 501 });
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return withCors(empty());

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      try {
      if (path === '/health' && request.method === 'GET') return withCors(json({ ok: true, service: 'moto-system-api' }));

      if (path === '/auth/login' && request.method === 'POST') return withCors(await handleAuthLogin(request, env));
      if (path === '/auth/refresh' && request.method === 'POST') return withCors(await handleAuthRefresh(request, env));
      if (path === '/auth/logout' && request.method === 'POST') return withCors(await handleAuthLogout(request, env));
      if (path === '/auth/me' && request.method === 'GET') return withCors(await handleAuthMe(request, env));
      if (path === '/auth/change-password' && request.method === 'POST') return withCors(await handleChangePassword(request, env));
      if (path === '/auth/seed-admin' && request.method === 'POST') return withCors(await handleSeedAdmin(request, env));

      if (path === '/config' && request.method === 'GET') return withCors(await handleConfigGet(request, env));
      if (path === '/config' && request.method === 'PUT') return withCors(await handleConfigSet(request, env));

      if (path === '/users' && request.method === 'GET') return withCors(await handleUsersList(request, env));
      if (path === '/users' && request.method === 'POST') return withCors(await handleUsersCreate(request, env));
      if (path.startsWith('/users/') && request.method === 'PATCH') return withCors(await handleUsersUpdate(request, env, path.split('/')[2]));

      if (path === '/points' && request.method === 'GET') return withCors(await handlePointsList(request, env));
      if (path === '/points' && request.method === 'POST') return withCors(await handlePointsCreate(request, env));
      if (path.startsWith('/points/') && request.method === 'PATCH') return withCors(await handlePointsUpdate(request, env, path.split('/')[2]));

      if (path === '/brands' && request.method === 'GET') return withCors(await handleBrandsList(request, env));
      if (path === '/brands' && request.method === 'POST') return withCors(await handleBrandsCreate(request, env));
      if (path.startsWith('/brands/') && request.method === 'PATCH') return withCors(await handleBrandsUpdate(request, env, path.split('/')[2]));
      if (path.startsWith('/brands/') && request.method === 'DELETE') return withCors(await handleBrandsDelete(request, env, path.split('/')[2]));

      if (path === '/products/motos' && request.method === 'GET') return withCors(await handleInventoryList(request, env, 'motos'));
      if (path === '/products/motos' && request.method === 'POST') return withCors(await handleInventoryCreate(request, env, 'motos'));
      if (path === '/products/motos/import' && request.method === 'POST') return withCors(await importInventoryCsv(request, env, 'motos'));
      if (path.startsWith('/products/motos/') && request.method === 'PATCH') return withCors(await handleInventoryUpdate(request, env, 'motos', path.split('/')[3]));
      if (path.startsWith('/products/motos/') && request.method === 'DELETE') return withCors(await handleInventoryDelete(request, env, 'motos', path.split('/')[3]));

      if (path === '/products/motos-e' && request.method === 'GET') return withCors(await handleInventoryList(request, env, 'motos_e'));
      if (path === '/products/motos-e' && request.method === 'POST') return withCors(await handleInventoryCreate(request, env, 'motos_e'));
      if (path === '/products/motos-e/import' && request.method === 'POST') return withCors(await importInventoryCsv(request, env, 'motos_e'));
      if (path.startsWith('/products/motos-e/') && request.method === 'PATCH') return withCors(await handleInventoryUpdate(request, env, 'motos_e', path.split('/')[3]));
      if (path.startsWith('/products/motos-e/') && request.method === 'DELETE') return withCors(await handleInventoryDelete(request, env, 'motos_e', path.split('/')[3]));

      if (path === '/products/accesorios' && request.method === 'GET') return withCors(await handleInventoryList(request, env, 'accesorios'));
      if (path === '/products/accesorios' && request.method === 'POST') return withCors(await handleInventoryCreate(request, env, 'accesorios'));
      if (path === '/products/accesorios/import' && request.method === 'POST') return withCors(await importInventoryCsv(request, env, 'accesorios'));
      if (path.startsWith('/products/accesorios/') && request.method === 'PATCH') return withCors(await handleInventoryUpdate(request, env, 'accesorios', path.split('/')[3]));
      if (path.startsWith('/products/accesorios/') && request.method === 'DELETE') return withCors(await handleInventoryDelete(request, env, 'accesorios', path.split('/')[3]));

      if (path === '/products/repuestos' && request.method === 'GET') return withCors(await handleInventoryList(request, env, 'repuestos'));
      if (path === '/products/repuestos' && request.method === 'POST') return withCors(await handleInventoryCreate(request, env, 'repuestos'));
      if (path === '/products/repuestos/import' && request.method === 'POST') return withCors(await importInventoryCsv(request, env, 'repuestos'));
      if (path.startsWith('/products/repuestos/') && request.method === 'PATCH') return withCors(await handleInventoryUpdate(request, env, 'repuestos', path.split('/')[3]));
      if (path.startsWith('/products/repuestos/') && request.method === 'DELETE') return withCors(await handleInventoryDelete(request, env, 'repuestos', path.split('/')[3]));

      if (path === '/inventory/transfers' && request.method === 'POST') return withCors(await handleInventoryTransfer(request, env));

      if (path === '/quotes' && request.method === 'GET') return withCors(await handleQuotesList(request, env));
      if (path === '/quotes' && request.method === 'POST') return withCors(await handleQuotesCreate(request, env));
      if (path.startsWith('/quotes/') && request.method === 'GET' && !path.endsWith('/cancel')) return withCors(await handleQuotesGet(request, env, path.split('/')[2]));
      if (path.startsWith('/quotes/') && request.method === 'POST' && path.endsWith('/cancel')) return withCors(await handleQuotesCancel(request, env, path.split('/')[2]));

      if (path === '/sales' && request.method === 'GET') return withCors(await handleSalesList(request, env));
      if (path === '/sales' && request.method === 'POST') return withCors(await handleSalesCreate(request, env));
      if (path.startsWith('/sales/') && request.method === 'GET' && !path.endsWith('/cancel')) return withCors(await handleSalesGet(request, env, path.split('/')[2]));
      if (path.startsWith('/sales/') && request.method === 'POST' && path.endsWith('/cancel')) return withCors(await handleSalesCancel(request, env, path.split('/')[2]));

      if (path === '/tramites' && request.method === 'GET') return withCors(await handleTramitesList(request, env));
      if (path === '/tramites' && request.method === 'POST') return withCors(await handleTramitesCreate(request, env));
      if (path.startsWith('/tramites/') && request.method === 'PATCH') return withCors(await handleTramitesUpdate(request, env, path.split('/')[2]));

      if (path === '/exports/backup' && request.method === 'GET') return withCors(await handleBackupExport(request, env));
      if (path === '/exports/manual' && request.method === 'GET') return withCors(await handleManualExport());
      if (path.startsWith('/exports/quotes/') && request.method === 'GET') return withCors(await handleQuoteExport(request, env, path.split('/')[3]));
      if (path === '/exports/inventory/motos' && request.method === 'GET') return withCors(await handleInventoryExport(request, env, 'motos'));
      if (path === '/exports/inventory/motos-e' && request.method === 'GET') return withCors(await handleInventoryExport(request, env, 'motos_e'));
      if (path === '/exports/inventory/accesorios' && request.method === 'GET') return withCors(await handleInventoryExport(request, env, 'accesorios'));
      if (path === '/exports/inventory/repuestos' && request.method === 'GET') return withCors(await handleInventoryExport(request, env, 'repuestos'));
      if (path === '/exports/inventory/productos' && request.method === 'GET') return withCors(await handleInventoryExport(request, env, 'productos'));

      if (path === '/reports/inventory' && request.method === 'GET') return withCors(await handleInventoryReport(request, env));
      if (path === '/reports/sales' && request.method === 'GET') return withCors(await handleSalesReport(request, env));
      if (path === '/reports/quotes' && request.method === 'GET') return withCors(await handleQuotesReport(request, env));
      if (path === '/reports/tramites' && request.method === 'GET') return withCors(await handleTramitesReport(request, env));
      if (path === '/exports/reports/sales' && request.method === 'GET') return withCors(await handleSalesReportExport(request, env));
      if (path === '/exports/reports/quotes' && request.method === 'GET') return withCors(await handleQuotesReportExport(request, env));
      if (path === '/exports/reports/tramites' && request.method === 'GET') return withCors(await handleTramitesReportExport(request, env));

      if (path.startsWith('/reports/') || path.endsWith('/export/pdf')) {
        return withCors(notMigrated(path));
      }

      return withCors(notFound());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message === 'Se requiere rol de Supervisor'
          ? 403
          : (
              message.includes('Sesion')
              || message.includes('Usuario no autorizado')
              || message.includes('La sesion fue reemplazada')
            )
            ? 401
            : 500;

        console.error('Worker request error', { path, message });
        return withCors(fail(error, status));
      }
    } catch (error) {
      console.error('Worker fatal error', error);
      return withCors(fail(error, 500));
    }
  },
};
