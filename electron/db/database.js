const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db = null

function getDbPath() {
  const envPath = process.env.MOTO_DB_PATH
  if (envPath) return envPath
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) return path.join(process.cwd(), 'moto_system.db')
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'moto_system.db')
}

function getDb() {
  if (!db) throw new Error('Base de datos no inicializada')
  return db
}

function initDb() {
  const dbPath = getDbPath()
  console.log('[DB] Ruta:', dbPath)

  db = new Database(dbPath)

  // Performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  ensureMarcasSchema()
  seedConfig()
  console.log('[DB] Inicializada correctamente')
  return db
}

function createTables() {
  db.exec(`
    -- ─── MARCAS ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS marcas (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT    NOT NULL UNIQUE,
      activo    INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- ─── USUARIOS ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre        TEXT    NOT NULL,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      rol           TEXT    NOT NULL CHECK(rol IN ('SUPERVISOR','CAJERO')),
      activo        INTEGER NOT NULL DEFAULT 1,
      creado_en     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- ─── CONFIG ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ─── MOTOS ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS motos (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      marca_id             INTEGER REFERENCES marcas(id),
      marca                TEXT    NOT NULL,
      modelo               TEXT    NOT NULL,
      tipo                 TEXT,
      color                TEXT,
      chasis               TEXT    NOT NULL UNIQUE,
      cilindrada           TEXT,
      motor                TEXT,
      precio               REAL    NOT NULL,
      precio_final         REAL    NOT NULL,
      descuento_maximo_pct REAL    NOT NULL,
      cantidad_libre       INTEGER NOT NULL DEFAULT 0,
      cantidad_reservada   INTEGER NOT NULL DEFAULT 0,
      cantidad_vendida     INTEGER NOT NULL DEFAULT 0,
      activo               INTEGER NOT NULL DEFAULT 1,
      creado_en            TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- ─── ACCESORIOS ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS accesorios (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      marca_id             INTEGER REFERENCES marcas(id),
      marca                TEXT,
      tipo                 TEXT    NOT NULL,
      color                TEXT,
      precio               REAL    NOT NULL,
      precio_final         REAL    NOT NULL,
      descuento_maximo_pct REAL    NOT NULL,
      cantidad_libre       INTEGER NOT NULL DEFAULT 0,
      cantidad_reservada   INTEGER NOT NULL DEFAULT 0,
      cantidad_vendida     INTEGER NOT NULL DEFAULT 0,
      activo               INTEGER NOT NULL DEFAULT 1,
      creado_en            TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- ─── REPUESTOS ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS repuestos (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      marca_id             INTEGER REFERENCES marcas(id),
      marca                TEXT,
      tipo                 TEXT    NOT NULL,
      precio               REAL    NOT NULL,
      precio_final         REAL    NOT NULL,
      descuento_maximo_pct REAL    NOT NULL,
      cantidad_libre       INTEGER NOT NULL DEFAULT 0,
      cantidad_reservada   INTEGER NOT NULL DEFAULT 0,
      cantidad_vendida     INTEGER NOT NULL DEFAULT 0,
      activo               INTEGER NOT NULL DEFAULT 1,
      creado_en            TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- ─── PROFORMAS ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS proformas (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo           TEXT    NOT NULL UNIQUE,
      vendedor_id      INTEGER NOT NULL REFERENCES usuarios(id),
      cliente_nombre   TEXT    NOT NULL,
      cliente_ci_nit   TEXT    NOT NULL,
      cliente_celular  TEXT    NOT NULL,
      fecha_creacion   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      fecha_expiracion TEXT    NOT NULL,
      subtotal         REAL    NOT NULL DEFAULT 0,
      total_descuentos REAL    NOT NULL DEFAULT 0,
      total            REAL    NOT NULL DEFAULT 0,
      estado           TEXT    NOT NULL DEFAULT 'ACTIVA'
                             CHECK(estado IN ('ACTIVA','VENCIDA','CONVERTIDA','CANCELADA')),
      notas            TEXT
    );

    -- ─── PROFORMA ITEMS ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS proforma_items (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      proforma_id           INTEGER NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
      moto_id               INTEGER REFERENCES motos(id),
      accesorio_id          INTEGER REFERENCES accesorios(id),
      repuesto_id           INTEGER REFERENCES repuestos(id),
      descripcion           TEXT    NOT NULL,
      precio_costo_snap     REAL    NOT NULL,
      precio_final_snap     REAL    NOT NULL,
      descuento_maximo_snap REAL    NOT NULL,
      descuento_pct         REAL    NOT NULL,
      descuento_monto       REAL    NOT NULL,
      cantidad              INTEGER NOT NULL,
      precio_unitario_final REAL    NOT NULL,
      subtotal              REAL    NOT NULL
    );

    -- ─── VENTAS ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS ventas (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo           TEXT    NOT NULL UNIQUE,
      proforma_id      INTEGER REFERENCES proformas(id),
      vendedor_id      INTEGER NOT NULL REFERENCES usuarios(id),
      cliente_nombre   TEXT    NOT NULL,
      cliente_ci_nit   TEXT    NOT NULL,
      cliente_celular  TEXT    NOT NULL,
      subtotal         REAL    NOT NULL,
      total_descuentos REAL    NOT NULL,
      total            REAL    NOT NULL,
      estado           TEXT    NOT NULL DEFAULT 'COMPLETADA'
                             CHECK(estado IN ('COMPLETADA','ANULADA')),
      notas            TEXT,
      fecha_venta      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- ─── VENTA ITEMS ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS venta_items (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id              INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
      moto_id               INTEGER REFERENCES motos(id),
      accesorio_id          INTEGER REFERENCES accesorios(id),
      repuesto_id           INTEGER REFERENCES repuestos(id),
      descripcion           TEXT    NOT NULL,
      precio_costo_snap     REAL    NOT NULL,
      precio_final_snap     REAL    NOT NULL,
      descuento_maximo_snap REAL    NOT NULL,
      descuento_pct         REAL    NOT NULL,
      descuento_monto       REAL    NOT NULL,
      cantidad              INTEGER NOT NULL,
      precio_unitario_final REAL    NOT NULL,
      subtotal              REAL    NOT NULL
    );

    -- ─── TRÁMITES ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tramites (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_item_id  INTEGER NOT NULL REFERENCES venta_items(id) ON DELETE CASCADE,
      tipo           TEXT    NOT NULL CHECK(tipo IN ('BSISA','PLACA')),
      nombre         TEXT    NOT NULL,
      marca          TEXT,
      costo_total    REAL    NOT NULL,
      cobro_en_venta INTEGER NOT NULL,
      a_cuenta       REAL,
      saldo          REAL,
      estado         TEXT    NOT NULL DEFAULT 'PENDIENTE'
                          CHECK(estado IN ('PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO')),
      observaciones  TEXT,
      creado_en      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      actualizado_en TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_tramites_venta_item_tipo ON tramites(venta_item_id, tipo);

    -- ─── ÍNDICES ─────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_motos_activo         ON motos(activo);
    CREATE INDEX IF NOT EXISTS idx_accesorios_activo    ON accesorios(activo);
    CREATE INDEX IF NOT EXISTS idx_repuestos_activo     ON repuestos(activo);
    CREATE INDEX IF NOT EXISTS idx_marcas_activo        ON marcas(activo);
    CREATE INDEX IF NOT EXISTS idx_proformas_estado     ON proformas(estado);
    CREATE INDEX IF NOT EXISTS idx_proformas_expiracion ON proformas(fecha_expiracion);
    CREATE INDEX IF NOT EXISTS idx_proforma_items_pf    ON proforma_items(proforma_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha         ON ventas(fecha_venta);
    CREATE INDEX IF NOT EXISTS idx_venta_items_venta    ON venta_items(venta_id);
    CREATE INDEX IF NOT EXISTS idx_tramites_estado      ON tramites(estado);
    CREATE INDEX IF NOT EXISTS idx_tramites_venta_item  ON tramites(venta_item_id);
  `)
}

function ensureMarcasSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marcas (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT    NOT NULL UNIQUE,
      activo    INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `)

  const ensureColumn = (table, columnDef) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
    const colName = columnDef.split(/\s+/)[0]
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`)
    }
  }

  ensureColumn('motos', 'marca_id INTEGER REFERENCES marcas(id)')
  ensureColumn('accesorios', 'marca_id INTEGER REFERENCES marcas(id)')
  ensureColumn('repuestos', 'marca_id INTEGER REFERENCES marcas(id)')

  const tx = db.transaction(() => {
    db.exec(`
      INSERT OR IGNORE INTO marcas (nombre)
      SELECT DISTINCT marca FROM motos WHERE marca IS NOT NULL AND TRIM(marca) <> '';
      INSERT OR IGNORE INTO marcas (nombre)
      SELECT DISTINCT marca FROM accesorios WHERE marca IS NOT NULL AND TRIM(marca) <> '';
      INSERT OR IGNORE INTO marcas (nombre)
      SELECT DISTINCT marca FROM repuestos WHERE marca IS NOT NULL AND TRIM(marca) <> '';
    `)

    db.exec(`
      UPDATE motos
      SET marca_id = (SELECT id FROM marcas WHERE nombre = motos.marca)
      WHERE (marca_id IS NULL OR marca_id = 0) AND marca IS NOT NULL AND TRIM(marca) <> '';

      UPDATE accesorios
      SET marca_id = (SELECT id FROM marcas WHERE nombre = accesorios.marca)
      WHERE (marca_id IS NULL OR marca_id = 0) AND marca IS NOT NULL AND TRIM(marca) <> '';

      UPDATE repuestos
      SET marca_id = (SELECT id FROM marcas WHERE nombre = repuestos.marca)
      WHERE (marca_id IS NULL OR marca_id = 0) AND marca IS NOT NULL AND TRIM(marca) <> '';
    `)
  })

  tx()
}

function seedConfig() {
  const stmt = db.prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING")
  stmt.run('tramite_bsisa_costo', '0')
  stmt.run('tramite_placa_costo', '0')
}

// Seed: crea supervisor inicial si no existe ninguno
function seedAdmin() {
  const existing = db.prepare("SELECT id FROM usuarios WHERE rol = 'SUPERVISOR' LIMIT 1").get()
  if (existing) return { ok: false, mensaje: 'Ya existe un supervisor' }

  const crypto = require('crypto')
  const hash = crypto.createHash('sha256').update('admin123').digest('hex')

  db.prepare(`
    INSERT INTO usuarios (nombre, username, password_hash, rol)
    VALUES ('Administrador', 'admin', ?, 'SUPERVISOR')
  `).run(hash)

  return { ok: true, mensaje: 'Admin creado — usuario: admin / contraseña: admin123' }
}

module.exports = { initDb, getDb, seedAdmin }
