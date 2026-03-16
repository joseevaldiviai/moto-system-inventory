const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const outPath = path.join(process.cwd(), 'Manual_Moto_System.pdf')

const images = {
  dashboard: '/tmp/ai-chat-attachment-16441624635978865242.png',
  inventario: '/tmp/ai-chat-attachment-3122054732103790678.png',
  proformas: '/tmp/ai-chat-attachment-13817984217840072482.png',
  reportes: '/tmp/ai-chat-attachment-15435231414212035124.png',
  perfil: '/tmp/ai-chat-attachment-5488918791792970605.png',
}

const ensureImage = (p) => {
  if (!fs.existsSync(p)) {
    throw new Error(`No se encontró la imagen: ${p}`)
  }
}

Object.values(images).forEach(ensureImage)

const doc = new PDFDocument({ size: 'A4', margin: 40 })
doc.pipe(fs.createWriteStream(outPath))

const pageWidth = () => doc.page.width - doc.page.margins.left - doc.page.margins.right
const addTitle = (text) => {
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#111').text(text)
  doc.moveDown(0.5)
}

const addH2 = (text) => {
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text(text)
  doc.moveDown(0.3)
}

const addPara = (text) => {
  doc.font('Helvetica').fontSize(10).fillColor('#222').text(text, { lineGap: 2 })
  doc.moveDown(0.5)
}

const addBullets = (items) => {
  doc.font('Helvetica').fontSize(10).fillColor('#222')
  items.forEach((it) => {
    doc.text(`• ${it}`)
  })
  doc.moveDown(0.6)
}

const addFooter = () => {
  const bottom = doc.page.height - doc.page.margins.bottom + 10
  doc.font('Helvetica').fontSize(8).fillColor('#666')
  doc.text('Manual de usuario - Moto System', doc.page.margins.left, bottom, { align: 'left' })
}

const addPageBreak = () => {
  const hasContent = doc.y > doc.page.margins.top + 2
  if (!hasContent) return
  addFooter()
  doc.addPage()
}

const drawBox = (x, y, w, h, title, body) => {
  doc.rect(x, y, w, h).strokeColor('#444').stroke()
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(title, x + 8, y + 6)
  doc.font('Helvetica').fontSize(8).fillColor('#333').text(body, x + 8, y + 20, { width: w - 16 })
}

const drawArrow = (x1, y1, x2, y2) => {
  doc.moveTo(x1, y1).lineTo(x2, y2).strokeColor('#444').stroke()
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = 6
  doc.moveTo(x2, y2)
    .lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6))
    .lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6))
    .lineTo(x2, y2)
    .fillColor('#444')
    .fill()
}

// Portada
addTitle('Manual de Usuario - Moto System')
doc.font('Helvetica').fontSize(11).fillColor('#333')
doc.text('Sistema de gestión para concesionario de motos (Windows)')
doc.moveDown(1)
doc.font('Helvetica').fontSize(10).fillColor('#555')
doc.text(`Versión del documento: ${new Date().toISOString().slice(0, 10)}`)
doc.moveDown(2)
doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text('Contenido')
doc.font('Helvetica').fontSize(10).fillColor('#333')
doc.text('1. Requisitos del sistema')
doc.text('2. Instalación en Windows')
doc.text('3. Primer ingreso y roles')
doc.text('4. Estructura del sistema')
doc.text('5. Procedimiento recomendado')
doc.text('6. Uso por módulos')
doc.text('7. Respaldo y base de datos')
doc.text('8. Buenas prácticas y seguridad')
doc.text('9. Preguntas frecuentes')
doc.text('10. Anexos: Capturas')

addPageBreak()

// Requisitos
addH2('1. Requisitos del sistema')
addPara('Este sistema está diseñado para operar en entornos de oficina con conexión eléctrica estable. No necesita conexión permanente a internet porque toda la información se guarda localmente. Esto significa que puedes seguir operando incluso si no hay conexión, y la información se mantiene en el equipo donde se instaló.')
addBullets([
  'Windows 7/10/11 (64-bit).',
  'Mínimo 4 GB de RAM (recomendado 8 GB).',
  'Al menos 500 MB libres en disco.',
  'No requiere instalación de Node.js ni servidores externos.',
])
addPara('Si el equipo cumple con los requisitos recomendados, la aplicación responderá de forma fluida incluso con listados grandes y múltiples operaciones diarias.')

// Instalación
addH2('2. Instalación en Windows')
addPara('La instalación es similar a la de cualquier programa de escritorio. No se requieren permisos especiales adicionales si el usuario tiene permisos de instalación en Windows. Se recomienda cerrar otras aplicaciones durante la instalación para evitar bloqueos de archivos.')
addBullets([
  'Ejecuta el instalador `moto-system.exe`.',
  'Selecciona la carpeta de instalación.',
  'Finaliza el asistente y abre la aplicación.',
])
addPara('La aplicación guarda la base de datos en la carpeta de usuario:')
doc.font('Helvetica-Bold').fontSize(10).text('C:\\Users\\<usuario>\\AppData\\Roaming\\moto-system\\moto_system.db')
doc.moveDown(0.6)
addPara('Importante: No borres este archivo si necesitas conservar tu información. Esta base de datos contiene inventario, clientes, proformas y ventas. Si necesitas mover el sistema a otro equipo, este archivo es el elemento principal que debes respaldar.')

// Primer ingreso
addH2('3. Primer ingreso y roles')
addPara('Al abrir por primera vez, crea el usuario administrador desde la pantalla de login. Este usuario inicial tiene el rol de Supervisor y puede crear otros usuarios. Luego cambia la contraseña desde Usuarios o Perfil para mayor seguridad.')
addBullets([
  'Supervisor: administración completa del sistema.',
  'Cajero: operaciones de ventas y consulta.',
  'La sesión se cierra al salir de la aplicación.',
])
addPara('En el uso diario se recomienda que cada persona tenga su propio usuario para registrar quién hizo cada operación. Esto facilita auditorías y el control de responsabilidades.')
addPara('Recomendaciones iniciales:')
addBullets([
  'Define un usuario supervisor y un usuario cajero por cada persona.',
  'Configura los costos de trámites (BSISA y PLACA) desde el Dashboard.',
  'Registra marcas antes de cargar motos, para mantener consistencia.',
])
addPara('Después de estos pasos, el sistema queda listo para registrar inventario y operar ventas. Es aconsejable hacer una primera carga de productos antes de iniciar operaciones comerciales.')

// Diagrama flujo
addH2('4. Estructura del sistema')
addPara('El sistema está organizado por módulos. Cada módulo cumple una función específica y se conecta con los demás para mantener la información coherente. Este diseño evita duplicidad de datos y ayuda a que las operaciones de venta y proforma actualicen el stock en tiempo real. A continuación se muestra el flujo general de datos:')
const x = doc.page.margins.left
const y = doc.y
const w = pageWidth()
const boxW = (w - 40) / 3
const boxH = 50
drawBox(x, y, boxW, boxH, 'Login', 'Autenticación del usuario')
drawBox(x + boxW + 20, y, boxW, boxH, 'Operación', 'Inventario, Proformas, Ventas')
drawBox(x + (boxW + 20) * 2, y, boxW, boxH, 'Reportes', 'PDFs y consultas')
drawArrow(x + boxW, y + boxH / 2, x + boxW + 20, y + boxH / 2)
drawArrow(x + boxW * 2 + 20, y + boxH / 2, x + boxW * 2 + 40, y + boxH / 2)
doc.moveDown(4)

addPara('Estructura de datos y relación entre módulos:')
const y2 = doc.y
drawBox(x, y2, boxW, boxH, 'Inventario', 'Motos, accesorios, repuestos, marcas')
drawBox(x + boxW + 20, y2, boxW, boxH, 'Proformas', 'Reservas de stock + vencimiento')
drawBox(x + (boxW + 20) * 2, y2, boxW, boxH, 'Ventas', 'Conversión desde proformas')
drawArrow(x + boxW, y2 + boxH / 2, x + boxW + 20, y2 + boxH / 2)
drawArrow(x + boxW * 2 + 20, y2 + boxH / 2, x + boxW * 2 + 40, y2 + boxH / 2)

addPageBreak()

// Procedimiento recomendado
addH2('5. Procedimiento recomendado')
addPara('A continuación se describe un flujo sugerido para operar el sistema de manera ordenada y evitar errores comunes. Puedes adaptarlo a tu realidad operativa, pero mantener este orden ayuda a reducir problemas de stock o de información incompleta.')
addBullets([
  '1) Configurar costos de trámites y usuarios.',
  '2) Registrar marcas y cargar inventario.',
  '3) Crear proformas para reservar stock con fecha límite.',
  '4) Convertir proformas en ventas cuando el cliente confirme.',
  '5) Generar reportes y respaldos periódicos.',
])
addPara('Notas importantes:')
addBullets([
  'Las proformas reservan stock hasta su vencimiento.',
  'Una venta puede crearse desde una proforma o de forma directa (según rol).',
  'Los reportes se pueden exportar a PDF para archivo o auditoría.',
])
addPara('Siguiendo este orden se reduce el riesgo de inconsistencias de stock o pérdidas de información. Si tu negocio tiene procesos especiales, puedes añadir pasos, pero es recomendable mantener la lógica de inventario → proforma → venta.')

addPageBreak()

// Uso por módulos
addH2('6. Uso por módulos')
addPara('Esta sección explica cómo operar los módulos principales. Las capturas de pantalla con detalles se encuentran al final del documento en el apartado de Anexos (Sección 10). Lee esta sección primero y usa los anexos como referencia visual.')
addBullets([
  'Dashboard: monitorea indicadores y costos de trámites.',
  'Inventario: registra productos, actualiza stock y define descuentos máximos.',
  'Proformas: crea reservas con fecha límite e imprime PDF.',
  'Reportes: filtra por fechas y exporta información.',
  'Perfil/Respaldo: gestiona contraseña y copias de seguridad.',
])

// Respaldo
addH2('7. Respaldo y base de datos')
addPara('El respaldo se genera desde Perfil → Respaldo de base de datos. Se crea un archivo .db que puede restaurarse reemplazando la base de datos en la ruta de usuario. Este archivo contiene toda la información del sistema: inventario, clientes, proformas, ventas y configuración.')
addBullets([
  'Ubicación por defecto: C:\\Users\\<usuario>\\AppData\\Roaming\\moto-system\\moto_system.db',
  'Recomendación: guardar respaldos en una carpeta externa o en la nube.',
])
addPara('Para restaurar, cierra la aplicación, reemplaza el archivo .db y vuelve a abrir la app. Se recomienda hacer esta operación cuando no haya usuarios trabajando para evitar inconsistencias.')

// FAQ
addH2('8. Buenas prácticas y seguridad')
addBullets([
  'Realiza respaldos diarios o semanales según volumen de ventas.',
  'Evita compartir usuarios entre personas.',
  'No cierres la aplicación durante procesos de guardado o exportación.',
  'Verifica la fecha límite de proformas para evitar reservas vencidas.',
])
addPara('Una buena práctica es mantener un respaldo por semana y otro por mes para poder regresar a estados anteriores si fuese necesario. También puedes guardar respaldos por fecha si hay cierres contables.')

addH2('9. Preguntas frecuentes')
addBullets([
  '¿Se puede usar sin internet? Sí, toda la información se guarda localmente.',
  '¿Qué pasa si cierro la app? La sesión se cierra y se debe volver a iniciar.',
  '¿Cómo mover la base de datos? Copia el archivo .db y reemplázalo en la ruta de usuario.',
  '¿Se puede imprimir una proforma? Sí, desde el detalle de proforma existe un botón para generar PDF.',
  '¿Qué pasa si una proforma vence? El sistema la marca como vencida y libera el stock reservado.',
])

// Anexos: Capturas
addH2('10. Anexos: Capturas')
addPara('Las siguientes imágenes corresponden a las secciones operativas descritas en el manual. Cada captura incluye una referencia a la sección donde se explica su uso. En este anexo se muestran dos capturas por página para facilitar la revisión visual.')

const renderImagePairBlock = (data, blockHeight) => {
  const maxW = pageWidth()
  const headerH = doc.heightOfString(data.title, { width: maxW }) +
    doc.heightOfString(data.caption, { width: maxW }) +
    (data.ref ? doc.heightOfString(data.ref, { width: maxW }) : 0) + 8
  const imgH = Math.max(120, blockHeight - headerH)

  addH2(data.title)
  doc.font('Helvetica').fontSize(9).fillColor('#333').text(data.caption)
  if (data.ref) doc.font('Helvetica').fontSize(8).fillColor('#666').text(data.ref)
  doc.moveDown(0.3)
  doc.image(data.imgPath, doc.page.margins.left, doc.y, { fit: [maxW, imgH] })
  doc.moveDown(0.3)
}

const addImagePairPage = (a, b, isFirst, isLast) => {
  if (!isFirst) {
    addFooter()
    doc.addPage()
  }
  const available = doc.page.height - doc.page.margins.bottom - doc.y
  const blockHeight = (available - 16) / 2
  renderImagePairBlock(a, blockHeight)
  renderImagePairBlock(b, blockHeight)
  if (isLast) addFooter()
}

const dashboardData = {
  title: 'Dashboard',
  imgPath: images.dashboard,
  caption: 'Resumen de stock, accesos rápidos y costos de trámites.',
  ref: 'Corresponde a la Sección 6: Uso por módulos (Dashboard).',
}

const inventarioData = {
  title: 'Inventario',
  imgPath: images.inventario,
  caption: 'Gestión de motos, accesorios, repuestos y marcas. Importación CSV y exportación PDF.',
  ref: 'Corresponde a la Sección 6: Uso por módulos (Inventario).',
}

const proformasData = {
  title: 'Proformas',
  imgPath: images.proformas,
  caption: 'Creación y gestión de proformas con fecha límite y detalle de ítems.',
  ref: 'Corresponde a la Sección 6: Uso por módulos (Proformas).',
}

const reportesData = {
  title: 'Reportes',
  imgPath: images.reportes,
  caption: 'Reportes de ventas y proformas con filtros por fecha y usuario.',
  ref: 'Corresponde a la Sección 6: Uso por módulos (Reportes).',
}

const perfilData = {
  title: 'Perfil y respaldo',
  imgPath: images.perfil,
  caption: 'Cambio de contraseña y respaldo manual de base de datos.',
  ref: 'Corresponde a la Sección 6: Uso por módulos (Perfil/Respaldo).',
}

addImagePairPage(dashboardData, inventarioData, true, false)
addImagePairPage(proformasData, reportesData, false, false)
addImagePairPage(perfilData, dashboardData, false, true)

doc.end()

console.log(`Manual generado: ${outPath}`)
