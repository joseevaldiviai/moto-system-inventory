export function parseCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  if (!lines.length) throw new Error('CSV vacio');

  const header = lines[0].split(',').map((value) => value.trim());
  const rows = lines.slice(1).map((line) => line.split(',').map((value) => value.trim()));
  return { header, rows };
}

export function requireColumns(header, columns) {
  const missing = columns.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`CSV invalido. Faltan columnas: ${missing.join(', ')}`);
}

export function rowObject(header, row) {
  const result = {};
  for (let index = 0; index < header.length; index += 1) {
    result[header[index]] = row[index] ?? '';
  }
  return result;
}

export function requiredNumber(value, field) {
  if (value === '' || value === null || value === undefined) throw new Error(`Campo requerido: ${field}`);
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) throw new Error(`Numero invalido en ${field}`);
  return numericValue;
}

export function numberOrZero(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) throw new Error('Numero invalido');
  return numericValue;
}

export function textOrNull(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue === '' ? null : cleanValue;
}
