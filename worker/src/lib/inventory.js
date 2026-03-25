const TABLES = {
  motos: { table: 'motos', select: '*, marcas(nombre)', search: ['marca', 'ano', 'chasis'] },
  motos_e: { table: 'motos_e', select: '*, marcas(nombre)', search: ['marca', 'ano', 'chasis'] },
  accesorios: { table: 'accesorios', select: '*, marcas(nombre)', search: ['marca', 'tipo'] },
  repuestos: { table: 'repuestos', select: '*, marcas(nombre)', search: ['marca', 'tipo'] },
};

export function validatePricing({ precio, precio_final, costo, precio_venta, descuento_maximo_pct }) {
  const costValue = costo ?? precio;
  const saleValue = precio_venta ?? precio_final;
  if (costValue === undefined || saleValue === undefined || descuento_maximo_pct === undefined) return;
  if (Number(costValue) < 0 || Number(saleValue) < 0) throw new Error('Precio invalido');
  if (Number(saleValue) < Number(costValue)) throw new Error('El precio de venta no puede ser menor al costo');
  const ganancia = Number(saleValue) - Number(costValue);
  const descuentoMaximoMonto = (Number(saleValue) * Number(descuento_maximo_pct)) / 100;
  if (Number(descuento_maximo_pct) < 0 || Number(descuento_maximo_pct) > 100) throw new Error('descuento_maximo_pct invalido');
  if (descuentoMaximoMonto > ganancia) throw new Error('descuento_maximo_pct supera la ganancia unitaria');
}

export function normalizeStocks(data) {
  const cantidad_libre = Number(data.cantidad_libre ?? data.cantidad ?? 0);
  const cantidad_reservada = Number(data.cantidad_reservada ?? 0);
  const cantidad_vendida = Number(data.cantidad_vendida ?? 0);
  if ([cantidad_libre, cantidad_reservada, cantidad_vendida].some((value) => value < 0 || Number.isNaN(value))) {
    throw new Error('Cantidades invalidas');
  }
  return { cantidad_libre, cantidad_reservada, cantidad_vendida };
}

export async function resolveMarca(admin, data, required = false) {
  let marcaId = data?.marca_id ?? null;
  if (marcaId === '' || marcaId === 0) marcaId = null;
  const marcaNombre = (data?.marca ?? '').trim();

  if (marcaId) {
    const { data: row, error } = await admin
      .from('marcas')
      .select('id, nombre')
      .eq('id', marcaId)
      .eq('activo', true)
      .single();
    if (error || !row) throw new Error('Marca no encontrada');
    return { marca_id: row.id, marca_nombre: row.nombre };
  }

  if (marcaNombre) {
    const { data: existing } = await admin
      .from('marcas')
      .select('id, nombre')
      .ilike('nombre', marcaNombre)
      .maybeSingle();

    if (existing) return { marca_id: existing.id, marca_nombre: existing.nombre };

    const { data: created, error } = await admin
      .from('marcas')
      .insert({ nombre: marcaNombre })
      .select('id, nombre')
      .single();
    if (error || !created) throw new Error('No se pudo crear la marca');
    return { marca_id: created.id, marca_nombre: created.nombre };
  }

  if (required) throw new Error('Marca requerida');
  return { marca_id: null, marca_nombre: null };
}

export function getInventoryConfig(kind) {
  const config = TABLES[kind];
  if (!config) throw new Error('Tipo de inventario no soportado');
  return config;
}
