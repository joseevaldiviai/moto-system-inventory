import { useState } from "react";

const TABLES = {
  usuarios: {
    color: "#ef4444", icon: "🔐", x: 20, y: 20,
    desc: "Usuarios del sistema. El Supervisor gestiona descuentos y usuarios.",
    fields: [
      { name: "id",               type: "INTEGER", pk: true },
      { name: "nombre",           type: "TEXT",    nn: true },
      { name: "username",         type: "TEXT",    nn: true, unique: true },
      { name: "password_hash",    type: "TEXT",    nn: true },
      { name: "rol",              type: "TEXT",    nn: true,  note: "SUPERVISOR | CAJERO" },
      { name: "activo",           type: "INTEGER", note: "1 / 0" },
      { name: "creado_en",        type: "TEXT" },
    ],
  },

  motos: {
    color: "#f59e0b", icon: "🏍️", x: 360, y: 20,
    desc: "precio = costo compra. precio_final = venta al cliente. descuento_maximo_pct lo fija el Supervisor y nunca puede superar la ganancia unitaria.",
    fields: [
      { name: "id",                  type: "INTEGER", pk: true },
      { name: "marca",               type: "TEXT",    nn: true },
      { name: "modelo",              type: "TEXT",    nn: true },
      { name: "tipo",                type: "TEXT" },
      { name: "color",               type: "TEXT" },
      { name: "chasis",              type: "TEXT",    nn: true, unique: true },
      { name: "cilindrada",          type: "TEXT" },
      { name: "motor",               type: "TEXT" },
      { name: "precio",              type: "REAL",    nn: true, price: true, note: "💲 costo de compra" },
      { name: "precio_final",        type: "REAL",    nn: true, price: true, note: "💲 precio de venta al cliente" },
      { name: "descuento_maximo_pct",type: "REAL",    nn: true, discount: true, note: "% máximo — fijado por Supervisor" },
      { name: "cantidad_libre",      type: "INTEGER", nn: true, stock: true },
      { name: "cantidad_reservada",  type: "INTEGER", nn: true, stock: true },
      { name: "cantidad_vendida",    type: "INTEGER", nn: true, stock: true },
      { name: "activo",              type: "INTEGER" },
      { name: "creado_en",           type: "TEXT" },
    ],
  },

  accesorios: {
    color: "#3b82f6", icon: "🛡️", x: 720, y: 20,
    desc: "Igual que motos: precio de compra, precio_final de venta y descuento máximo fijado por Supervisor.",
    fields: [
      { name: "id",                  type: "INTEGER", pk: true },
      { name: "marca",               type: "TEXT" },
      { name: "tipo",                type: "TEXT",    nn: true },
      { name: "color",               type: "TEXT" },
      { name: "precio",              type: "REAL",    nn: true, price: true,    note: "💲 costo de compra" },
      { name: "precio_final",        type: "REAL",    nn: true, price: true,    note: "💲 precio de venta al cliente" },
      { name: "descuento_maximo_pct",type: "REAL",    nn: true, discount: true, note: "% máximo — fijado por Supervisor" },
      { name: "cantidad_libre",      type: "INTEGER", nn: true, stock: true },
      { name: "cantidad_reservada",  type: "INTEGER", nn: true, stock: true },
      { name: "cantidad_vendida",    type: "INTEGER", nn: true, stock: true },
      { name: "activo",              type: "INTEGER" },
      { name: "creado_en",           type: "TEXT" },
    ],
  },

  repuestos: {
    color: "#8b5cf6", icon: "⚙️", x: 720, y: 360,
    desc: "Igual que motos y accesorios.",
    fields: [
      { name: "id",                  type: "INTEGER", pk: true },
      { name: "marca",               type: "TEXT" },
      { name: "tipo",                type: "TEXT",    nn: true },
      { name: "precio",              type: "REAL",    nn: true, price: true,    note: "💲 costo de compra" },
      { name: "precio_final",        type: "REAL",    nn: true, price: true,    note: "💲 precio de venta al cliente" },
      { name: "descuento_maximo_pct",type: "REAL",    nn: true, discount: true, note: "% máximo — fijado por Supervisor" },
      { name: "cantidad_libre",      type: "INTEGER", nn: true, stock: true },
      { name: "cantidad_reservada",  type: "INTEGER", nn: true, stock: true },
      { name: "cantidad_vendida",    type: "INTEGER", nn: true, stock: true },
      { name: "activo",              type: "INTEGER" },
      { name: "creado_en",           type: "TEXT" },
    ],
  },

  proformas: {
    color: "#06b6d4", icon: "📋", x: 20, y: 340,
    desc: "Presupuesto. El total es la suma de sus ítems con descuentos individuales ya aplicados.",
    fields: [
      { name: "id",               type: "INTEGER", pk: true },
      { name: "codigo",           type: "TEXT",    nn: true, unique: true, note: "PRO-2025-0001" },
      { name: "vendedor_id",      type: "INTEGER", fk: "usuarios", nn: true },
      { name: "cliente_nombre",   type: "TEXT",    nn: true },
      { name: "cliente_ci_nit",   type: "TEXT",    nn: true },
      { name: "cliente_celular",  type: "TEXT",    nn: true },
      { name: "fecha_creacion",   type: "TEXT" },
      { name: "fecha_expiracion", type: "TEXT",    note: "al vencer → libera stock reservado" },
      { name: "subtotal",         type: "REAL",    note: "suma precio_final * cantidad (sin descuentos)" },
      { name: "total_descuentos", type: "REAL",    note: "suma de todos los descuentos_monto de ítems" },
      { name: "total",            type: "REAL",    note: "subtotal − total_descuentos" },
      { name: "estado",           type: "TEXT",    note: "ACTIVA | VENCIDA | CONVERTIDA | CANCELADA" },
      { name: "notas",            type: "TEXT" },
    ],
  },

  proforma_items: {
    color: "#06b6d4", icon: "📝", x: 360, y: 330,
    desc: "Cada ítem tiene su propio descuento. El vendedor fija el % pero no puede superar descuento_maximo_pct del producto.",
    fields: [
      { name: "id",                  type: "INTEGER", pk: true },
      { name: "proforma_id",         type: "INTEGER", fk: "proformas",  nn: true },
      { name: "moto_id",             type: "INTEGER", fk: "motos",      note: "nullable — solo 1 de los 3" },
      { name: "accesorio_id",        type: "INTEGER", fk: "accesorios", note: "nullable" },
      { name: "repuesto_id",         type: "INTEGER", fk: "repuestos",  note: "nullable" },
      { name: "descripcion",         type: "TEXT",    nn: true,  note: "snapshot nombre" },
      { name: "precio_costo_snap",   type: "REAL",    nn: true,  price: true, note: "snapshot precio (costo)" },
      { name: "precio_final_snap",   type: "REAL",    nn: true,  price: true, note: "snapshot precio_final (venta)" },
      { name: "descuento_maximo_snap",type: "REAL",   nn: true,  discount: true, note: "snapshot descuento_maximo_pct" },
      { name: "descuento_pct",       type: "REAL",    nn: true,  discount: true, note: "% aplicado por el vendedor" },
      { name: "descuento_monto",     type: "REAL",    nn: true,  note: "precio_final_snap * descuento_pct / 100" },
      { name: "cantidad",            type: "INTEGER", nn: true },
      { name: "precio_unitario_final",type: "REAL",   nn: true,  note: "precio_final_snap − descuento_monto" },
      { name: "subtotal",            type: "REAL",    nn: true,  note: "precio_unitario_final * cantidad" },
    ],
  },

  ventas: {
    color: "#10b981", icon: "💰", x: 20, y: 730,
    desc: "Consolidación de una proforma (o venta directa excepcional). Congela todos los precios y mueve stock a vendido.",
    fields: [
      { name: "id",               type: "INTEGER", pk: true },
      { name: "codigo",           type: "TEXT",    nn: true, unique: true, note: "VEN-2025-0001" },
      { name: "proforma_id",      type: "INTEGER", fk: "proformas", note: "nullable — venta directa excepcional" },
      { name: "vendedor_id",      type: "INTEGER", fk: "usuarios",  nn: true },
      { name: "cliente_nombre",   type: "TEXT",    nn: true },
      { name: "cliente_ci_nit",   type: "TEXT",    nn: true },
      { name: "cliente_celular",  type: "TEXT",    nn: true },
      { name: "subtotal",         type: "REAL",    nn: true },
      { name: "total_descuentos", type: "REAL",    nn: true },
      { name: "total",            type: "REAL",    nn: true, note: "NO incluye trámites con cobro_en_venta=0" },
      { name: "estado",           type: "TEXT",    note: "COMPLETADA | ANULADA" },
      { name: "notas",            type: "TEXT" },
      { name: "fecha_venta",      type: "TEXT" },
    ],
  },

  venta_items: {
    color: "#10b981", icon: "🧾", x: 360, y: 650,
    desc: "Snapshot completo de precios y descuentos al momento de la venta.",
    fields: [
      { name: "id",                   type: "INTEGER", pk: true },
      { name: "venta_id",             type: "INTEGER", fk: "ventas",     nn: true },
      { name: "moto_id",              type: "INTEGER", fk: "motos",      note: "nullable" },
      { name: "accesorio_id",         type: "INTEGER", fk: "accesorios", note: "nullable" },
      { name: "repuesto_id",          type: "INTEGER", fk: "repuestos",  note: "nullable" },
      { name: "descripcion",          type: "TEXT",    nn: true, note: "snapshot" },
      { name: "precio_costo_snap",    type: "REAL",    nn: true, price: true, note: "snapshot costo" },
      { name: "precio_final_snap",    type: "REAL",    nn: true, price: true, note: "snapshot precio venta" },
      { name: "descuento_maximo_snap",type: "REAL",    nn: true, discount: true },
      { name: "descuento_pct",        type: "REAL",    nn: true, discount: true },
      { name: "descuento_monto",      type: "REAL",    nn: true },
      { name: "cantidad",             type: "INTEGER", nn: true },
      { name: "precio_unitario_final",type: "REAL",    nn: true },
      { name: "subtotal",             type: "REAL",    nn: true },
    ],
  },

  tramites: {
    color: "#f97316", icon: "📄", x: 720, y: 650,
    desc: "BSISA o PLACA ligado a un venta_item de moto. Máx. 2 por moto (uno de cada tipo). cobro_en_venta define si va en el total o es flujo aparte.",
    fields: [
      { name: "id",             type: "INTEGER", pk: true },
      { name: "venta_item_id",  type: "INTEGER", fk: "venta_items", nn: true },
      { name: "tipo",           type: "TEXT",    nn: true,  note: "BSISA | PLACA" },
      { name: "nombre",         type: "TEXT",    nn: true },
      { name: "marca",          type: "TEXT" },
      { name: "costo_total",    type: "REAL",    nn: true },
      { name: "cobro_en_venta", type: "INTEGER", nn: true,  note: "1 = en venta.total | 0 = cobro aparte" },
      { name: "a_cuenta",       type: "REAL",    note: "si cobro_en_venta = 0" },
      { name: "saldo",          type: "REAL",    note: "costo_total − a_cuenta" },
      { name: "estado",         type: "TEXT",    note: "PENDIENTE | EN_PROCESO | COMPLETADO | CANCELADO" },
      { name: "observaciones",  type: "TEXT" },
      { name: "creado_en",      type: "TEXT" },
      { name: "actualizado_en", type: "TEXT" },
    ],
  },
};

const TW = 295, RH = 22, HH = 42;
const tH = t => HH + t.fields.length * RH + 6;

export default function App() {
  const [tab, setTab] = useState("diagram");
  const [sel, setSel] = useState(null);

  const maxX = Math.max(...Object.values(TABLES).map(t => t.x + TW)) + 20;
  const maxY = Math.max(...Object.values(TABLES).map(t => t.y + tH(t))) + 20;
  const selT = sel ? TABLES[sel] : null;

  return (
    <div style={{ background:"#09090f", minHeight:"100vh", fontFamily:"monospace", color:"#e0dff0", display:"flex", flexDirection:"column" }}>

      {/* HEADER */}
      <div style={{ background:"#0d1520", borderBottom:"1px solid #1a2d3d", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:4, color:"#f59e0b", textTransform:"uppercase" }}>◆ MOTO SYSTEM — BD v4 FINAL</div>
          <div style={{ fontSize:17, fontWeight:"bold", color:"#fff" }}>Modelo de Base de Datos</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[["diagram","📐 Diagrama"],["pricing","💲 Precios & Descuentos"],["flow","🔄 Flujo stock"],["rules","📋 Reglas"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{
              padding:"6px 14px", borderRadius:20, cursor:"pointer", fontSize:12,
              background: tab===id ? "#f59e0b" : "transparent",
              border: `1px solid ${tab===id ? "#f59e0b" : "#1e2d3d"}`,
              color: tab===id ? "#000" : "#8898a8",
              fontWeight: tab===id ? "bold" : "normal",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── DIAGRAM ── */}
      {tab === "diagram" && (
        <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
          <div style={{ flex:1, overflow:"auto", padding:12 }}>
            <div style={{ display:"flex", gap:16, marginBottom:10, fontSize:11, flexWrap:"wrap" }}>
              {[["🔑","PK","#f59e0b"],["🔗","FK","#3b82f6"],["★","UNIQUE","#f59e0b"],["!","NOT NULL","#ef4444"],["▓","Stock","#10b981"],["💲","Precio","#a78bfa"],["▼","Descuento","#f97316"]].map(([i,l,c])=>(
                <span key={l} style={{color:c}}>{i} {l}</span>
              ))}
            </div>
            <svg width={maxX} height={maxY} style={{display:"block"}}>
              {Object.entries(TABLES).map(([tn,tbl])=>
                tbl.fields.filter(f=>f.fk).map(f=>{
                  const tgt=TABLES[f.fk]; if(!tgt) return null;
                  const fi=tbl.fields.indexOf(f);
                  const sx=tbl.x+TW, sy=tbl.y+HH+fi*RH+RH/2;
                  const tx=tgt.x+TW/2, ty=tgt.y+tH(tgt);
                  const hi=sel===tn||sel===f.fk;
                  return (
                    <g key={`${tn}-${f.name}`}>
                      <path d={`M${sx} ${sy} C${sx+50} ${sy} ${tx} ${ty+40} ${tx} ${ty}`}
                        fill="none" stroke={hi?tbl.color:"#192838"}
                        strokeWidth={hi?2:1}
                        strokeDasharray={f.note?.includes("nullable")?"5 3":"none"}
                        opacity={sel&&!hi?0.1:0.7}
                      />
                      <polygon points={`${tx-4},${ty} ${tx+4},${ty} ${tx},${ty-7}`}
                        fill={hi?tbl.color:"#192838"} opacity={sel&&!hi?0.1:0.8}/>
                    </g>
                  );
                })
              )}

              {Object.entries(TABLES).map(([tn,tbl])=>{
                const h=tH(tbl), isSel=sel===tn, isDim=sel&&!isSel;
                return (
                  <g key={tn} onClick={()=>setSel(sel===tn?null:tn)} style={{cursor:"pointer"}} opacity={isDim?0.2:1}>
                    <rect x={tbl.x+3} y={tbl.y+3} width={TW} height={h} rx={7} fill="#000" opacity={0.4}/>
                    <rect x={tbl.x} y={tbl.y} width={TW} height={h} rx={7} fill="#0d1520" stroke={isSel?tbl.color:"#1a2d3d"} strokeWidth={isSel?2:1}/>
                    <rect x={tbl.x} y={tbl.y} width={TW} height={HH} rx={7} fill={tbl.color} opacity={0.14}/>
                    <rect x={tbl.x} y={tbl.y+HH-6} width={TW} height={6} fill={tbl.color} opacity={0.14}/>
                    <rect x={tbl.x} y={tbl.y} width={4} height={h} rx={2} fill={tbl.color}/>
                    <text x={tbl.x+13} y={tbl.y+17} fill={tbl.color} fontSize={11} fontWeight="bold">{tbl.icon} {tn.toUpperCase()}</text>
                    <text x={tbl.x+13} y={tbl.y+32} fill="#4a6070" fontSize={9}>{tbl.fields.length} campos · click para detalle</text>
                    {tbl.fields.map((f,i)=>{
                      const fy=tbl.y+HH+i*RH;
                      const fieldColor = f.pk?"#f59e0b":f.fk?"#88b8d8":f.stock?"#10b981":f.price?"#a78bfa":f.discount?"#f97316":"#b8c8d8";
                      const bgColor = f.stock?"#10b981":f.price?"#a78bfa":f.discount?"#f97316":null;
                      return (
                        <g key={f.name}>
                          {bgColor && <rect x={tbl.x+4} y={fy+1} width={TW-8} height={RH-2} rx={3} fill={bgColor} opacity={0.07}/>}
                          <text x={tbl.x+11} y={fy+15} fontSize={9} fill={f.pk?"#f59e0b":f.fk?"#3b82f6":"#2a4050"}>{f.pk?"🔑":f.fk?"🔗":"  "}</text>
                          <text x={tbl.x+29} y={fy+15} fontSize={10} fill={fieldColor} fontWeight={f.pk?"bold":"normal"}>{f.name}</text>
                          <text x={tbl.x+188} y={fy+15} fontSize={9} fill="#2a4050">{f.type}</text>
                          {f.unique&&<text x={tbl.x+244} y={fy+15} fontSize={9} fill="#f59e0b">★</text>}
                          {f.nn    &&<text x={tbl.x+258} y={fy+15} fontSize={9} fill="#ef4444">!</text>}
                          {i<tbl.fields.length-1&&<line x1={tbl.x+7} y1={fy+RH} x2={tbl.x+TW-7} y2={fy+RH} stroke="#111820" strokeWidth={0.5}/>}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Side panel */}
          <div style={{ width:300, background:"#0d1520", borderLeft:"1px solid #1a2d3d", padding:18, overflowY:"auto", flexShrink:0 }}>
            {selT ? (
              <>
                <div style={{ fontSize:10, letterSpacing:3, color:selT.color, textTransform:"uppercase", marginBottom:3 }}>{selT.icon} TABLA</div>
                <div style={{ fontSize:17, fontWeight:"bold", color:"#fff", marginBottom:8 }}>{sel}</div>
                <div style={{ fontSize:12, color:"#5a7080", marginBottom:14, lineHeight:1.5 }}>{selT.desc}</div>
                {selT.fields.map(f=>{
                  const ac = f.pk?"#f59e0b":f.fk?"#3b82f6":f.stock?"#10b981":f.price?"#a78bfa":f.discount?"#f97316":selT.color;
                  return (
                    <div key={f.name} style={{ marginBottom:6, padding:"6px 10px", background:"#080c12", borderRadius:6, borderLeft:`2px solid ${ac}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:ac, fontWeight:f.pk?"bold":"normal" }}>{f.name}</span>
                        <span style={{ fontSize:10, color:"#3a5060" }}>{f.type}</span>
                      </div>
                      {f.fk   && <div style={{ fontSize:10, color:"#3b82f6",  marginTop:2 }}>→ {f.fk}.id</div>}
                      {f.note && <div style={{ fontSize:10, color:"#5a7080",  marginTop:2 }}>{f.note}</div>}
                      <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                        {f.pk       && <span style={{ fontSize:9, padding:"1px 5px", background:"#f59e0b22", color:"#f59e0b", borderRadius:3 }}>PK</span>}
                        {f.fk       && <span style={{ fontSize:9, padding:"1px 5px", background:"#3b82f622", color:"#3b82f6", borderRadius:3 }}>FK</span>}
                        {f.nn       && <span style={{ fontSize:9, padding:"1px 5px", background:"#ef444422", color:"#ef4444", borderRadius:3 }}>NOT NULL</span>}
                        {f.unique   && <span style={{ fontSize:9, padding:"1px 5px", background:"#f59e0b22", color:"#f59e0b", borderRadius:3 }}>UNIQUE</span>}
                        {f.stock    && <span style={{ fontSize:9, padding:"1px 5px", background:"#10b98122", color:"#10b981", borderRadius:3 }}>STOCK</span>}
                        {f.price    && <span style={{ fontSize:9, padding:"1px 5px", background:"#a78bfa22", color:"#a78bfa", borderRadius:3 }}>PRECIO</span>}
                        {f.discount && <span style={{ fontSize:9, padding:"1px 5px", background:"#f9731622", color:"#f97316", borderRadius:3 }}>DESCUENTO</span>}
                      </div>
                    </div>
                  );
                })}
                <button onClick={()=>setSel(null)} style={{ marginTop:8, width:"100%", padding:7, background:"transparent", border:"1px solid #1a2d3d", color:"#8898a8", borderRadius:6, cursor:"pointer", fontSize:11 }}>✕ Cerrar</button>
              </>
            ) : (
              <div style={{ color:"#2a4050", fontSize:12, marginTop:40, textAlign:"center", lineHeight:2 }}>
                <div style={{ fontSize:26, marginBottom:10 }}>👆</div>
                Click en una tabla para detalle
                <div style={{ marginTop:20, textAlign:"left", fontSize:11, lineHeight:2 }}>
                  {[["#10b981","▓ Verde = stock"],["#a78bfa","▓ Violeta = precios"],["#f97316","▓ Naranja = descuentos"],["#4a6070","— — FK nullable"],["#4a6070","——— FK NOT NULL"]].map(([c,t])=>(
                    <div key={t} style={{color:c}}>{t}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRICING ── */}
      {tab === "pricing" && (
        <div style={{ flex:1, overflow:"auto", padding:32 }}>
          <div style={{ maxWidth:740, margin:"0 auto" }}>
            <h2 style={{ fontSize:16, color:"#fff", marginBottom:4 }}>💲 Modelo de precios y descuentos</h2>
            <p style={{ fontSize:13, color:"#4a6070", marginBottom:32 }}>Aplica igual a motos, accesorios y repuestos</p>

            {/* Price anatomy */}
            <div style={{ background:"#0d1520", border:"1px solid #a78bfa44", borderRadius:12, padding:24, marginBottom:24 }}>
              <div style={{ fontSize:11, letterSpacing:3, color:"#a78bfa", textTransform:"uppercase", marginBottom:16 }}>Anatomía del precio</div>
              <div style={{ display:"flex", alignItems:"stretch", gap:0, marginBottom:20, borderRadius:8, overflow:"hidden", height:52 }}>
                <div style={{ flex:2, background:"#1e1040", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
                  <div style={{ fontSize:10, color:"#a78bfa" }}>precio</div>
                  <div style={{ fontSize:12, color:"#a78bfa", fontWeight:"bold" }}>costo compra</div>
                </div>
                <div style={{ flex:2, background:"#103020", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
                  <div style={{ fontSize:10, color:"#10b981" }}>ganancia</div>
                  <div style={{ fontSize:11, color:"#10b981" }}>precio_final − precio</div>
                </div>
                <div style={{ flex:3, background:"#0d2030", display:"flex", alignItems:"center", justifyContent:"center", borderLeft:"2px dashed #1a3a50" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"#06b6d4" }}>precio_final</div>
                    <div style={{ fontSize:12, color:"#06b6d4", fontWeight:"bold" }}>precio de venta</div>
                  </div>
                </div>
              </div>

              {[
                { label:"precio",               color:"#a78bfa", desc:"Lo que pagó el negocio. Base del cálculo de ganancia. Nunca visible al cliente." },
                { label:"precio_final",          color:"#06b6d4", desc:"Precio de lista al cliente. Es el precio base de cualquier proforma." },
                { label:"ganancia unitaria",     color:"#10b981", desc:"precio_final − precio. El descuento NUNCA puede superar este valor." },
                { label:"descuento_maximo_pct",  color:"#f97316", desc:"% máximo que puede aplicar el vendedor. Solo el Supervisor lo fija. Validado: (precio_final × descuento_maximo_pct / 100) ≤ ganancia unitaria." },
              ].map(r=>(
                <div key={r.label} style={{ display:"flex", gap:12, marginBottom:10, alignItems:"flex-start" }}>
                  <code style={{ fontSize:11, padding:"2px 8px", background:`${r.color}22`, color:r.color, borderRadius:4, flexShrink:0, marginTop:2 }}>{r.label}</code>
                  <span style={{ fontSize:13, color:"#8898a8", lineHeight:1.5 }}>{r.desc}</span>
                </div>
              ))}
            </div>

            {/* Discount flow */}
            <div style={{ background:"#0d1520", border:"1px solid #f9731644", borderRadius:12, padding:24, marginBottom:24 }}>
              <div style={{ fontSize:11, letterSpacing:3, color:"#f97316", textTransform:"uppercase", marginBottom:16 }}>Flujo de descuentos en un ítem</div>
              {[
                { paso:"1", actor:"Supervisor", accion:"Fija descuento_maximo_pct en el producto", ejemplo:'Honda CB150 → descuento_maximo_pct = 5%', color:"#ef4444" },
                { paso:"2", actor:"Sistema",    accion:"Valida que el monto no supere la ganancia", ejemplo:'precio_final=1500, precio=1200 → ganancia=300. 5% de 1500=75 ≤ 300 ✅', color:"#f59e0b" },
                { paso:"3", actor:"Vendedor",   accion:"Al crear proforma, elige descuento_pct ≤ descuento_maximo_pct", ejemplo:'Vendedor aplica 3% → válido (3 ≤ 5) ✅', color:"#06b6d4" },
                { paso:"4", actor:"Sistema",    accion:"Calcula descuento_monto y precio_unitario_final", ejemplo:'1500 × 3% = 45 → precio final = 1455', color:"#10b981" },
              ].map(s=>(
                <div key={s.paso} style={{ display:"flex", gap:14, marginBottom:12, padding:"12px 14px", background:"#080c12", borderRadius:8 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:`${s.color}22`, border:`1px solid ${s.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, color:s.color, fontWeight:"bold" }}>{s.paso}</div>
                  <div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:10, padding:"1px 6px", background:`${s.color}22`, color:s.color, borderRadius:10 }}>{s.actor}</span>
                      <span style={{ fontSize:13, color:"#d0d8e0" }}>{s.accion}</span>
                    </div>
                    <div style={{ fontSize:11, color:"#4a6070", fontFamily:"monospace" }}>{s.ejemplo}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Snapshot explanation */}
            <div style={{ background:"#0d1520", border:"1px solid #06b6d444", borderRadius:12, padding:24 }}>
              <div style={{ fontSize:11, letterSpacing:3, color:"#06b6d4", textTransform:"uppercase", marginBottom:12 }}>¿Por qué guardar snapshots?</div>
              <p style={{ fontSize:13, color:"#8898a8", lineHeight:1.7, marginBottom:12 }}>
                Los ítems de proforma y venta guardan <code style={{ color:"#a78bfa" }}>precio_costo_snap</code>, <code style={{ color:"#06b6d4" }}>precio_final_snap</code> y <code style={{ color:"#f97316" }}>descuento_maximo_snap</code> al momento de crearse.
              </p>
              <p style={{ fontSize:13, color:"#8898a8", lineHeight:1.7 }}>
                Esto garantiza que si el Supervisor cambia el precio de un producto mañana, las proformas y ventas anteriores conservan los precios originales. Los reportes históricos siempre son correctos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOW ── */}
      {tab === "flow" && (
        <div style={{ flex:1, overflow:"auto", padding:32 }}>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            <h2 style={{ fontSize:16, color:"#fff", marginBottom:4 }}>🔄 Flujo de stock</h2>
            <p style={{ fontSize:13, color:"#4a6070", marginBottom:24 }}>Aplica a motos, accesorios y repuestos por igual</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:28 }}>
              {[["✅","LIBRE","#10b981","Disponible"],["🔒","RESERVADO","#f59e0b","En proforma activa"],["💰","VENDIDO","#6b7280","Historial"]].map(([icon,label,color,desc])=>(
                <div key={label} style={{ background:"#0d1520", border:`1px solid ${color}44`, borderRadius:10, padding:16, textAlign:"center" }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>
                  <div style={{ fontSize:10, letterSpacing:2, color, textTransform:"uppercase", marginBottom:6 }}>{label}</div>
                  <div style={{ fontSize:11, color:"#5a7080" }}>{desc}</div>
                </div>
              ))}
            </div>
            {[
              { accion:"Crear proforma",              stock:"libre − n  →  reservado + n",   color:"#06b6d4", icon:"📋" },
              { accion:"Proforma vence (automático)", stock:"reservado − n  →  libre + n",   color:"#ef4444", icon:"⏰" },
              { accion:"Cancelar proforma",           stock:"reservado − n  →  libre + n",   color:"#ef4444", icon:"✕"  },
              { accion:"Convertir proforma → Venta",  stock:"reservado − n  →  vendido + n", color:"#10b981", icon:"💰" },
              { accion:"Venta directa (excepcional)", stock:"libre − n  →  vendido + n",     color:"#f59e0b", icon:"⚡" },
              { accion:"Anular venta (Supervisor)",   stock:"vendido − n  →  libre + n",     color:"#f97316", icon:"↩️" },
            ].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:14, marginBottom:10, padding:"12px 16px", background:"#0d1520", border:`1px solid ${f.color}33`, borderRadius:10 }}>
                <div style={{ width:30, height:30, borderRadius:"50%", background:`${f.color}22`, border:`1px solid ${f.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{f.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:"#fff", fontWeight:"bold" }}>{f.accion}</div>
                  <div style={{ fontSize:11, color:f.color, marginTop:3, fontFamily:"monospace" }}>{f.stock}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop:16, padding:14, background:"#0d1520", border:"1px solid #1a2d3d", borderRadius:10, fontSize:12, color:"#4a6070" }}>
              <strong style={{ color:"#f59e0b" }}>Invariante:</strong> cantidad_libre + cantidad_reservada + cantidad_vendida = constante (total histórico ingresado). Si cambia, es un bug.
            </div>
          </div>
        </div>
      )}

      {/* ── RULES ── */}
      {tab === "rules" && (
        <div style={{ flex:1, overflow:"auto", padding:32 }}>
          <div style={{ maxWidth:720, margin:"0 auto" }}>
            <h2 style={{ fontSize:16, color:"#fff", marginBottom:24 }}>📋 Reglas del negocio</h2>
            {[
              { titulo:"Precios", color:"#a78bfa", reglas:[
                "precio = costo de compra. Nunca se muestra al cliente.",
                "precio_final = precio de venta al público. Base de cualquier proforma.",
                "ganancia = precio_final − precio. Siempre debe ser > 0.",
                "descuento_maximo_pct solo lo puede modificar el Supervisor.",
                "Validación al guardar: (precio_final × descuento_maximo_pct / 100) ≤ ganancia. El sistema rechaza si se intenta poner un descuento mayor a la ganancia.",
              ]},
              { titulo:"Descuentos", color:"#f97316", reglas:[
                "El descuento se aplica por ítem, no sobre el total de la proforma.",
                "El vendedor elige el descuento_pct en cada ítem, con tope en descuento_maximo_pct.",
                "Se guardan snapshots: precio_costo_snap, precio_final_snap y descuento_maximo_snap para preservar el historial.",
                "descuento_monto = precio_final_snap × descuento_pct / 100",
                "precio_unitario_final = precio_final_snap − descuento_monto",
              ]},
              { titulo:"Ítems (proforma y venta)", color:"#06b6d4", reglas:[
                "Exactamente uno de moto_id, accesorio_id, repuesto_id debe tener valor. Los otros dos NULL.",
                "Los trámites solo pueden asociarse a ítems donde moto_id != NULL.",
                "Máx. 2 trámites por ítem de moto: uno BSISA y uno PLACA (UNIQUE en venta_item_id + tipo).",
              ]},
              { titulo:"Trámites", color:"#f97316", reglas:[
                "cobro_en_venta = 1: el costo_total ya está sumado en venta.total.",
                "cobro_en_venta = 0: flujo independiente con a_cuenta y saldo. saldo = costo_total − a_cuenta.",
                "venta.total NO suma los trámites con cobro_en_venta = 0.",
              ]},
              { titulo:"Roles", color:"#ef4444", reglas:[
                "Solo SUPERVISOR puede crear/editar usuarios.",
                "Solo SUPERVISOR puede modificar precio, precio_final y descuento_maximo_pct.",
                "Solo SUPERVISOR puede anular ventas.",
                "CAJERO puede crear proformas, convertirlas a venta y registrar trámites.",
              ]},
            ].map(s=>(
              <div key={s.titulo} style={{ marginBottom:16, background:"#0d1520", border:`1px solid ${s.color}33`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"10px 16px", background:`${s.color}14`, borderBottom:`1px solid ${s.color}22` }}>
                  <span style={{ fontSize:12, fontWeight:"bold", color:s.color, letterSpacing:1 }}>{s.titulo}</span>
                </div>
                <div style={{ padding:"12px 16px" }}>
                  {s.reglas.map((r,i)=>(
                    <div key={i} style={{ display:"flex", gap:10, marginBottom:8, alignItems:"flex-start" }}>
                      <span style={{ color:s.color, flexShrink:0, marginTop:2 }}>◆</span>
                      <span style={{ fontSize:13, color:"#8898a8", lineHeight:1.5 }}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
