import toast from 'react-hot-toast'
import dashboardImg from '../images/manual/dashboard.png'
import inventarioImg from '../images/manual/inventario.png'
import proformasImg from '../images/manual/proformas.png'
import reportesImg from '../images/manual/reportes.png'
import perfilImg from '../images/manual/perfil.png'

export default function Manual() {
  const S = {
    page: { padding: 32, fontFamily: 'Georgia,serif', color: 'var(--text)' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
    title: { fontSize: 22, color: 'var(--text-strong)', margin: 0 },
    subtitle: { fontSize: 12, color: 'var(--text-soft)' },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 },
    h2: { fontSize: 16, color: 'var(--text-strong)', margin: '8px 0' },
    h3: { fontSize: 14, color: 'var(--text-strong)', margin: '8px 0' },
    p: { fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, margin: '6px 0' },
    list: { margin: '6px 0 6px 18px', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 },
    img: { width: '100%', borderRadius: 8, border: '1px solid var(--border)' },
    caption: { fontSize: 11, color: 'var(--text-soft)', marginTop: 6 },
  }

  return (
    <div style={S.page} className="manual-page">
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Manual de Usuario</h1>
          <div style={S.subtitle}>Moto System · Guía detallada de instalación, operación y buenas prácticas</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTimeout(() => window.print(), 100)} style={S.btn}>Imprimir</button>
          <button onClick={async () => {
            const res = await window.api.exportManualPdf()
            if (!res?.ok) return toast.error('No se pudo exportar el PDF')
            toast.success('PDF exportado')
          }} style={S.btn}>Exportar PDF</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.h2}>1. Requisitos del sistema</div>
        <p style={S.p}>El sistema funciona en Windows y no requiere conexión permanente a internet, ya que toda la información se guarda localmente en el equipo.</p>
        <ul style={S.list}>
          <li>Windows 7/10/11 (64-bit).</li>
          <li>Mínimo 4 GB de RAM (recomendado 8 GB).</li>
          <li>Al menos 500 MB libres en disco.</li>
          <li>No requiere Node.js ni servidores externos.</li>
        </ul>
        <p style={S.p}>Si el equipo cumple con los requisitos recomendados, la aplicación será estable incluso con listados grandes y múltiples operaciones diarias.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>2. Instalación en Windows</div>
        <p style={S.p}>La instalación es similar a cualquier software de escritorio. Se recomienda cerrar otras aplicaciones durante la instalación.</p>
        <ul style={S.list}>
          <li>Ejecuta el instalador `moto-system.exe`.</li>
          <li>Selecciona la carpeta de instalación.</li>
          <li>Finaliza el asistente y abre la aplicación.</li>
        </ul>
        <p style={S.p}>La base de datos se guarda en: `C:\Users\&lt;usuario&gt;\AppData\Roaming\moto-system\moto_system.db`</p>
        <p style={S.p}>Este archivo contiene inventario, clientes, proformas y ventas. No debe borrarse si se desea conservar la información.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>3. Primer ingreso y roles</div>
        <p style={S.p}>En el primer ingreso se crea el usuario administrador desde la pantalla de login. Cambia la contraseña después de iniciar.</p>
        <ul style={S.list}>
          <li>Supervisor: administración completa del sistema.</li>
          <li>Cajero: operaciones de ventas y consulta.</li>
          <li>La sesión se cierra al salir de la aplicación.</li>
        </ul>
        <p style={S.p}>Se recomienda que cada persona tenga su propio usuario para controlar responsabilidades y auditorías.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>4. Flujo recomendado de trabajo</div>
        <ol style={S.list}>
          <li>Configurar costos de trámites y usuarios.</li>
          <li>Registrar marcas y cargar inventario.</li>
          <li>Crear proformas para reservar stock con fecha límite.</li>
          <li>Convertir proformas en ventas cuando el cliente confirme.</li>
          <li>Generar reportes y respaldos periódicos.</li>
        </ol>
        <p style={S.p}>Seguir este flujo reduce errores de stock o registros incompletos.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>5. Uso por módulos</div>

        <div style={S.h3}>Dashboard</div>
        <p style={S.p}>Muestra indicadores de stock, valor de inventario y accesos rápidos. Permite ajustar costos de trámites.</p>

        <div style={{ height: 12 }} />

        <div style={S.h3}>Inventario</div>
        <p style={S.p}>Permite registrar motos, accesorios y repuestos, definir descuentos máximos e importar CSV.</p>

        <div style={{ height: 12 }} />

        <div style={S.h3}>Proformas</div>
        <p style={S.p}>Crea proformas con fecha límite, detalle de ítems, impresión y cancelación.</p>

        <div style={{ height: 12 }} />

        <div style={S.h3}>Reportes</div>
        <p style={S.p}>Consulta ventas y proformas con filtros y exporta a PDF.</p>

        <div style={{ height: 12 }} />

        <div style={S.h3}>Perfil y respaldo</div>
        <p style={S.p}>Cambia contraseña y genera respaldos manuales de la base de datos.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>6. Respaldo y recuperación</div>
        <p style={S.p}>El respaldo se genera desde Perfil → Respaldo de base de datos. Se crea un archivo .db con toda la información.</p>
        <ul style={S.list}>
          <li>Guardar respaldos en una carpeta externa o en la nube.</li>
          <li>Hacer respaldos semanales y mensuales.</li>
          <li>Para restaurar, cerrar la app y reemplazar el archivo .db.</li>
        </ul>
      </div>

      <div style={S.card}>
        <div style={S.h2}>7. Buenas prácticas</div>
        <ul style={S.list}>
          <li>No compartir usuarios entre personas.</li>
          <li>Evitar cerrar la app durante guardados o exportaciones.</li>
          <li>Revisar fechas límite de proformas.</li>
          <li>Mantener inventario actualizado para evitar ventas sin stock.</li>
        </ul>
      </div>

      <div style={S.card}>
        <div style={S.h2}>8. Preguntas frecuentes</div>
        <ul style={S.list}>
          <li>¿Se puede usar sin internet? Sí, toda la información es local.</li>
          <li>¿Qué pasa si cierro la app? La sesión se cierra automáticamente.</li>
          <li>¿Se puede imprimir una proforma? Sí, desde el detalle.</li>
          <li>¿Qué pasa si una proforma vence? Se marca como vencida y libera stock.</li>
        </ul>
      </div>

      <div style={S.card} className="manual-annex">
        <div style={S.h2}>9. Anexos: Capturas (2 por página)</div>
        <p style={S.p}>Las siguientes imágenes corresponden a las secciones operativas descritas en el manual. En impresión, cada página contiene dos capturas.</p>

        <div className="manual-pair">
          <div>
            <div style={S.h3}>Dashboard</div>
            <img src={dashboardImg} alt="Dashboard" style={S.img} />
            <div style={S.caption}>Figura A1. Dashboard</div>
          </div>
          <div>
            <div style={S.h3}>Inventario</div>
            <img src={inventarioImg} alt="Inventario" style={S.img} />
            <div style={S.caption}>Figura A2. Inventario</div>
          </div>
        </div>

        <div className="manual-pair">
          <div>
            <div style={S.h3}>Proformas</div>
            <img src={proformasImg} alt="Proformas" style={S.img} />
            <div style={S.caption}>Figura A3. Proformas</div>
          </div>
          <div>
            <div style={S.h3}>Reportes</div>
            <img src={reportesImg} alt="Reportes" style={S.img} />
            <div style={S.caption}>Figura A4. Reportes</div>
          </div>
        </div>

        <div className="manual-pair">
          <div>
            <div style={S.h3}>Perfil y respaldo</div>
            <img src={perfilImg} alt="Perfil y respaldo" style={S.img} />
            <div style={S.caption}>Figura A5. Perfil y respaldo</div>
          </div>
          <div>
            <div style={S.h3}>Resumen</div>
            <img src={dashboardImg} alt="Resumen" style={S.img} />
            <div style={S.caption}>Figura A6. Resumen visual</div>
          </div>
        </div>
      </div>
    </div>
  )
}
