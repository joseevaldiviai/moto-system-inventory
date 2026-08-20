const textValue = (value) => {
  const normalized = String(value ?? '').trim()
  return normalized || '-'
}

export function getProductGridColumns(kind, options = {}) {
  const { formatBs = (value) => String(value ?? '-'), getWarehouseLabel, includeWarehouse = false, showCost = true, renderAction, actionLabel = 'Acciones' } = options
  const warehouseColumns = includeWarehouse
    ? [{
        id: 'punto_venta',
        label: 'Almacen',
        cell: (row) => getWarehouseLabel ? getWarehouseLabel(row) : textValue(row?.punto_venta_nombre),
      }]
    : []
  const actionColumns = renderAction
    ? [{
        id: 'acciones',
        label: actionLabel,
        cell: (row) => renderAction(row),
      }]
    : []

  const stockColumns = [
    { id: 'cantidad_libre', label: 'Stock', cell: (row) => Number(row?.cantidad_libre || 0) },
    { id: 'cantidad_reservada', label: 'Reservado', cell: (row) => Number(row?.cantidad_reservada || 0) },
    { id: 'cantidad_vendida', label: 'Vendido', cell: (row) => Number(row?.cantidad_vendida || 0) },
  ]

  const moneyColumns = (costField, saleField, saleLabel) => ([
    ...(showCost ? [{ id: costField, label: 'Costo', cell: (row) => formatBs(row?.[costField]) }] : []),
    { id: saleField, label: saleLabel, cell: (row) => formatBs(row?.[saleField]) },
  ])

  if (kind === 'motos') {
    return [
      { id: 'marca', label: 'Marca', cell: (row) => textValue(row?.marca) },
      { id: 'tipo', label: 'Modelo', cell: (row) => textValue(row?.tipo) },
      { id: 'ano', label: 'Año', cell: (row) => textValue(row?.ano) },
      { id: 'color', label: 'Color', cell: (row) => textValue(row?.color) },
      { id: 'chasis', label: 'Chasis', cell: (row) => textValue(row?.chasis) },
      { id: 'cilindrada', label: 'Cilindrada', cell: (row) => textValue(row?.cilindrada) },
      { id: 'motor', label: 'Motor', cell: (row) => textValue(row?.motor) },
      { id: 'fecha_recepcion', label: 'F. Recepción', cell: (row) => textValue(row?.fecha_recepcion) },
      ...warehouseColumns,
      ...stockColumns,
      ...moneyColumns('costo', 'precio_venta', 'Precio venta'),
      { id: 'descuento_maximo_pct', label: 'Desc. Max %', cell: (row) => `${Number(row?.descuento_maximo_pct || 0)}%` },
      ...actionColumns,
    ]
  }

  if (kind === 'motos_e') {
    return [
      { id: 'marca', label: 'Marca', cell: (row) => textValue(row?.marca) },
      { id: 'tipo', label: 'Modelo', cell: (row) => textValue(row?.tipo) },
      { id: 'ano', label: 'Año', cell: (row) => textValue(row?.ano) },
      { id: 'color', label: 'Color', cell: (row) => textValue(row?.color) },
      { id: 'chasis', label: 'Chasis', cell: (row) => textValue(row?.chasis) },
      { id: 'potencia', label: 'Potencia (expresado en watts)', cell: (row) => textValue(row?.potencia) },
      { id: 'tipo_bateria', label: 'Tipo de batería (Litio - Plomo ácido)', cell: (row) => textValue(row?.tipo_bateria) },
      { id: 'bateria', label: 'Batería (expresados en voltios amp/hora)', cell: (row) => textValue(row?.bateria) },
      { id: 'motor', label: 'Motor', cell: (row) => textValue(row?.motor) },
      { id: 'fecha_recepcion', label: 'F. Recepción', cell: (row) => textValue(row?.fecha_recepcion) },
      ...warehouseColumns,
      ...stockColumns,
      ...moneyColumns('costo', 'precio_venta', 'Precio venta'),
      { id: 'descuento_maximo_pct', label: 'Desc. Max %', cell: (row) => `${Number(row?.descuento_maximo_pct || 0)}%` },
      ...actionColumns,
    ]
  }

  if (kind === 'accesorios') {
    return [
      { id: 'marca', label: 'Marca', cell: (row) => textValue(row?.marca) },
      { id: 'producto', label: 'Producto', cell: (row) => textValue(row?.producto) },
      { id: 'tipo', label: 'Codigo', cell: (row) => textValue(row?.tipo) },
      { id: 'color', label: 'Color', cell: (row) => textValue(row?.color) },
      { id: 'talla', label: 'Talla', cell: (row) => textValue(row?.talla) },
      { id: 'fecha_recepcion', label: 'F. Recepción', cell: (row) => textValue(row?.fecha_recepcion) },
      ...warehouseColumns,
      ...stockColumns,
      ...moneyColumns('precio', 'precio_final', 'Precio'),
      { id: 'descuento_maximo_pct', label: 'Desc. Max %', cell: (row) => `${Number(row?.descuento_maximo_pct || 0)}%` },
      ...actionColumns,
    ]
  }

  return [
    { id: 'marca', label: 'Marca', cell: (row) => textValue(row?.marca) },
    { id: 'producto', label: 'Producto', cell: (row) => textValue(row?.producto) },
    { id: 'tipo', label: 'Descripcion', cell: (row) => textValue(row?.tipo) },
    { id: 'fecha_recepcion', label: 'F. Recepción', cell: (row) => textValue(row?.fecha_recepcion) },
    ...warehouseColumns,
    ...stockColumns,
    ...moneyColumns('precio', 'precio_final', 'Precio'),
    { id: 'descuento_maximo_pct', label: 'Desc. Max %', cell: (row) => `${Number(row?.descuento_maximo_pct || 0)}%` },
    ...actionColumns,
  ]
}

