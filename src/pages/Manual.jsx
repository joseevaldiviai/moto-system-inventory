import toast from 'react-hot-toast'
import dashboardImg from '../images/manual/dashboard.png'
import inventarioImg from '../images/manual/inventario.png'
import proformasImg from '../images/manual/proformas.png'
import reportesImg from '../images/manual/reportes.png'
import perfilImg from '../images/manual/perfil.png'
import { api } from '../lib/apiClient'

export default function Manual() {
  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
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
    <div style={S.page} className="manual-page page-shell">
      <div style={{ ...S.header, flexWrap: 'wrap' }}>
        <div>
          <h1 style={S.title}>Manual de Usuario</h1>
          <div style={S.subtitle}>Moto System · Guía detallada de instalación, operación y buenas prácticas</div>
        </div>
        <div className="button-row">
          <button onClick={() => setTimeout(() => window.print(), 100)} style={S.btn}>Imprimir</button>
          <button onClick={async () => {
            const res = await api.exportManualPdf()
            if (!res?.ok) return toast.error('No se pudo exportar el archivo')
            toast.success('Archivo exportado')
          }} style={S.btn}>Exportar archivo</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.h2}>1. Requisitos del sistema</div>
        <p style={S.p}>El sistema funciona en navegador y requiere conexión al servicio desplegado para operar con los datos del negocio.</p>
        <ul style={S.list}>
          <li>Navegador moderno actualizado.</li>
          <li>Conexion a internet o red donde este desplegado el sistema.</li>
          <li>Credenciales de acceso habilitadas.</li>
          <li>No requiere instalacion de Node.js en el equipo cliente.</li>
        </ul>
        <p style={S.p}>Si el equipo cumple con estos requisitos, la aplicacion puede usarse desde cualquier puesto autorizado.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>2. Acceso al sistema web</div>
        <p style={S.p}>El acceso se realiza desde una URL publicada. No requiere instalador local.</p>
        <ul style={S.list}>
          <li>Abrir la URL oficial del sistema en el navegador.</li>
          <li>Iniciar sesion con usuario y contraseña.</li>
          <li>Trabajar segun permisos del rol asignado.</li>
        </ul>
        <p style={S.p}>La informacion se guarda en la base de datos central del sistema, no en archivos locales del equipo.</p>
        <p style={S.p}>Los respaldos deben descargarse desde la opcion administrativa correspondiente.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>3. Primer ingreso y roles</div>
        <p style={S.p}>En el primer ingreso se crea el usuario administrador desde la pantalla de login. Cambia la contraseña después de iniciar.</p>
        <ul style={S.list}>
          <li>Supervisor: administración completa del sistema.</li>
          <li>Cajero: operaciones de ventas y consulta.</li>
          <li>La sesion puede expirar y renovarse automaticamente segun el tiempo de acceso.</li>
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
        <p style={S.p}>Consulta ventas, proformas y tramites con filtros y exporta archivos descargables.</p>

        <div style={{ height: 12 }} />

        <div style={S.h3}>Perfil y respaldo</div>
        <p style={S.p}>Cambia contraseña y genera respaldos manuales de la base de datos.</p>
      </div>

      <div style={S.card}>
        <div style={S.h2}>6. Respaldo y recuperación</div>
        <p style={S.p}>El respaldo se genera desde Perfil → Respaldo de base de datos. Se descarga un archivo .json con la informacion exportada.</p>
        <ul style={S.list}>
          <li>Guardar respaldos en una carpeta externa o en la nube.</li>
          <li>Hacer respaldos semanales y mensuales.</li>
          <li>La restauracion debe hacerse con un proceso administrativo controlado.</li>
        </ul>
      </div>

      <div style={S.card}>
        <div style={S.h2}>7. Buenas prácticas</div>
        <ul style={S.list}>
          <li>No compartir usuarios entre personas.</li>
          <li>Evitar cerrar el navegador durante guardados o exportaciones.</li>
          <li>Revisar fechas límite de proformas.</li>
          <li>Mantener inventario actualizado para evitar ventas sin stock.</li>
        </ul>
      </div>

      <div style={S.card}>
        <div style={S.h2}>8. Preguntas frecuentes</div>
        <ul style={S.list}>
          <li>¿Se puede usar sin internet? No en el modo web desplegado.</li>
          <li>¿Qué pasa si cierro el navegador? La sesion puede reanudarse si sigue vigente.</li>
          <li>¿Se puede exportar una proforma? Si, desde el detalle.</li>
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
