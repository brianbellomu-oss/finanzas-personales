import { useState, useEffect, useRef } from "react";

// ── Storage ────────────────────────────────────────────────────
const SK     = "finanzas_v2";
const CFG_K  = "finanzas_cfg_v2";
const RULES_K = "finanzas_rules_v1"; // learned categorization rules

function loadLS(k, fb) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch(e) { return fb; }
}
function saveLS(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
}

// ── Config ─────────────────────────────────────────────────────
const DEFAULT_CFG = {
  bancos: ["BBVA", "ICBC"],
  tarjetas: ["Tarjeta 1", "Tarjeta 2", "Tarjeta 3"],
  usdRate: 1200,
};

// ── Categories ─────────────────────────────────────────────────
const CATS_EGRESO = [
  { id:"vivienda",        label:"Vivienda",      emoji:"🏠", color:"#f97316" },
  { id:"comida",          label:"Comida",        emoji:"🛒", color:"#10b981" },
  { id:"transporte",      label:"Transporte",    emoji:"🚗", color:"#3b82f6" },
  { id:"salud",           label:"Salud",         emoji:"💊", color:"#ef4444" },
  { id:"entretenimiento", label:"Entretenim.",   emoji:"🎬", color:"#a855f7" },
  { id:"ropa",            label:"Ropa",          emoji:"👗", color:"#ec4899" },
  { id:"servicios",       label:"Servicios",     emoji:"📱", color:"#06b6d4" },
  { id:"educacion",       label:"Educación",     emoji:"📚", color:"#eab308" },
  { id:"viajes",          label:"Viajes",        emoji:"✈️", color:"#8b5cf6" },
  { id:"varios",          label:"Varios",        emoji:"✨", color:"#64748b" },
];

const CATS_INGRESO = [
  { id:"sueldo",    label:"Sueldo",    emoji:"💼" },
  { id:"freelance", label:"Freelance", emoji:"💻" },
  { id:"renta",     label:"Renta",     emoji:"🏘️" },
  { id:"extra",     label:"Extra",     emoji:"⭐" },
  { id:"otro",      label:"Otro",      emoji:"📥" },
];

const MO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ── Helpers ────────────────────────────────────────────────────
function todayStr() { return new Date().toLocaleDateString("es-AR"); }
function dateToInput(str) {
  var p = str.split("/");
  if (p.length !== 3) return "";
  return p[2] + "-" + p[1].padStart(2,"0") + "-" + p[0].padStart(2,"0");
}
function inputToDate(str) {
  var p = str.split("-");
  if (p.length !== 3) return todayStr();
  return parseInt(p[2]) + "/" + parseInt(p[1]) + "/" + p[0];
}
function mkKey(d) {
  var p = d.split("/");
  return p.length === 3 ? p[2] + "-" + p[1].padStart(2,"0") : d;
}
function mkLbl(k) {
  var parts = k.split("-");
  return MO[parseInt(parts[1]) - 1] + " " + parts[0];
}
function fmt(n, mono) {
  var sym = mono === "USD" ? "U$S " : "$";
  return sym + Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}
function fmtK(n) {
  if (n >= 1000000) return "$" + (n/1000000).toFixed(1) + "M";
  if (n >= 1000)    return "$" + (n/1000).toFixed(0) + "K";
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 0 });
}
function toARS(monto, moneda, rate) {
  return moneda === "USD" ? monto * rate : monto;
}
function catOf(id) { return CATS_EGRESO.find(function(c) { return c.id === id; }) || CATS_EGRESO[CATS_EGRESO.length-1]; }

// ── PDF to base64 ──────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result.split(",")[1]); };
    reader.onerror = function() { reject(new Error("Error leyendo archivo")); };
    reader.readAsDataURL(file);
  });
}

// ── Claude API call ────────────────────────────────────────────
async function callClaude(messages, systemPrompt) {
  var body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemPrompt,
    messages: messages,
  };
  var resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body),
  });
  var data = await resp.json();
  var text = (data.content || []).map(function(b) { return b.text || ""; }).join("");
  return text;
}

// ── Color palette ──────────────────────────────────────────────
const BG    = "#f0f4f8";
const CARD  = "#ffffff";
const BORDER= "#e2e8f0";
const T1    = "#0f172a";
const T2    = "#475569";
const T3    = "#94a3b8";
const ACC1  = "#6366f1";
const ACC2  = "#10b981";
const ACC3  = "#f43f5e";

var INP_S = {
  width:"100%", padding:"12px 14px", borderRadius:12,
  background:"#f8fafc", border:"1px solid " + BORDER,
  color:T1, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit",
};

// ── UI Components ──────────────────────────────────────────────
function Donut(props) {
  var data = props.data || []; var s = props.size || 100; var t = props.thick || 18;
  var r = (s-t)/2; var cx = s/2; var cy = s/2; var circ = 2*Math.PI*r;
  var total = data.reduce(function(sum,d) { return sum+d.val; }, 0); var off = 0;
  return (
    <svg width={s} height={s} style={{ display:"block", flexShrink:0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={t} />
      {total > 0 && data.map(function(d,i) {
        var pct = d.val/total; var dash = pct*circ; var gap = circ-dash;
        var el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={t} strokeDasharray={dash+" "+gap} strokeDashoffset={-off*circ} strokeLinecap="butt" />;
        off += pct; return el;
      })}
    </svg>
  );
}
function Bar(props) {
  return (
    <div style={{ height:props.h||6, background:"#f1f5f9", borderRadius:99, overflow:"hidden" }}>
      <div style={{ width:Math.min(props.pct,100)+"%", height:"100%", background:props.color, borderRadius:99, transition:"width .5s" }} />
    </div>
  );
}
function Card(props) {
  return <div style={Object.assign({ background:CARD, border:"1px solid "+BORDER, borderRadius:20, padding:16, marginBottom:12 }, props.style||{})}>{props.children}</div>;
}
function SLabel(props) {
  return <div style={{ fontSize:9, letterSpacing:3, textTransform:"uppercase", color:T3, marginBottom:10, fontWeight:700 }}>{props.children}</div>;
}
function Pill(props) {
  return (
    <button onClick={props.onClick} style={{
      padding:"7px 13px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600,
      border:"1.5px solid "+(props.active ? props.color : BORDER),
      background: props.active ? props.color+"15" : "#f8fafc",
      color: props.active ? props.color : T3,
    }}>{props.children}</button>
  );
}

var EMPTY_EGRESO  = { tipo:"egreso",  desc:"", monto:"", moneda:"ARS", cat:"comida",  medio:"efectivo", fecha:todayStr(), editId:null };
var EMPTY_INGRESO = { tipo:"ingreso", desc:"", monto:"", moneda:"ARS", cat:"sueldo",  banco:"b1",        fecha:todayStr(), editId:null };
var EMPTY_AHORRO  = { tipo:"ahorro",  desc:"Ahorro", monto:"", moneda:"ARS", accion:"deposito", fecha:todayStr(), editId:null };

// ══════════════════════════════════════════════════════════════
export default function App() {
  var _data     = useState(function() { return loadLS(SK, { movs:[], ahorroManual:[] }); });
  var data      = _data[0]; var setData = _data[1];
  var _cfg      = useState(function() { return loadLS(CFG_K, DEFAULT_CFG); });
  var cfg       = _cfg[0]; var setCfg = _cfg[1];
  var _rules    = useState(function() { return loadLS(RULES_K, {}); }); // { "RAPIPAGO": "servicios", ... }
  var rules     = _rules[0]; var setRules = _rules[1];
  var _tab      = useState("home");
  var tab       = _tab[0]; var setTab = _tab[1];
  var _addType  = useState("egreso");
  var addType   = _addType[0]; var setAddType = _addType[1];
  var _form     = useState(Object.assign({}, EMPTY_EGRESO));
  var form      = _form[0]; var setForm = _form[1];
  var _flash    = useState(null);
  var flash     = _flash[0]; var setFlash = _flash[1];
  var _ecfg     = useState(null);
  var ecfg      = _ecfg[0]; var setEcfg = _ecfg[1];
  var _stab     = useState("cat");
  var stab      = _stab[0]; var setStab = _stab[1];

  // Import state
  var _importStep   = useState("upload"); // upload | loading | review | done
  var importStep    = _importStep[0]; var setImportStep = _importStep[1];
  var _importItems  = useState([]); // extracted items for review
  var importItems   = _importItems[0]; var setImportItems = _importItems[1];
  var _importTarjeta = useState("t1");
  var importTarjeta = _importTarjeta[0]; var setImportTarjeta = _importTarjeta[1];
  var _importError  = useState(null);
  var importError   = _importError[0]; var setImportError = _importError[1];
  var fileRef = useRef(null);

  useEffect(function() { saveLS(SK, data); }, [data]);
  useEffect(function() { saveLS(CFG_K, cfg); }, [cfg]);
  useEffect(function() { saveLS(RULES_K, rules); }, [rules]);

  function showFlash(msg) { setFlash(msg); setTimeout(function() { setFlash(null); }, 2500); }
  function setF(k,v) { setForm(function(f) { return Object.assign({},f,{[k]:v}); }); }

  function getMedios() {
    return [
      { id:"efectivo",      label:"Efectivo",      emoji:"💵" },
      { id:"transferencia", label:"Transferencia", emoji:"🔄" },
      { id:"t1", label:cfg.tarjetas[0], emoji:"💳" },
      { id:"t2", label:cfg.tarjetas[1], emoji:"💳" },
      { id:"t3", label:cfg.tarjetas[2], emoji:"💳" },
    ];
  }
  function getMedioLabel(id) {
    var m = getMedios().find(function(x) { return x.id === id; });
    return m ? m.emoji+" "+m.label : id;
  }
  function getBancoLabel(id) {
    if (id === "b1") return cfg.bancos[0];
    if (id === "b2") return cfg.bancos[1];
    return id;
  }

  var movs = data.movs || [];
  var ahorroManual = data.ahorroManual || [];
  var t1total = movs.filter(function(m) { return m.tipo==="ingreso"; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
  var t2total = movs.filter(function(m) { return m.tipo==="egreso";  }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
  var totalAhorroMov = ahorroManual.reduce(function(s,a) { return a.accion==="deposito" ? s+toARS(a.monto,a.moneda,cfg.usdRate) : s-toARS(a.monto,a.moneda,cfg.usdRate); }, 0);
  var nowKey = new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0");
  var movsMes = movs.filter(function(m) { return mkKey(m.fecha)===nowKey; });
  var ingMes  = movsMes.filter(function(m) { return m.tipo==="ingreso"; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
  var egrMes  = movsMes.filter(function(m) { return m.tipo==="egreso";  }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
  var saldoMes = ingMes - egrMes;
  var allKeys = movs.map(function(m) { return mkKey(m.fecha); }).concat(ahorroManual.map(function(a) { return mkKey(a.fecha); }));
  var months = Array.from(new Set(allKeys)).sort().reverse();

  function monthMovs(mk) {
    var mg  = movs.filter(function(m) { return mkKey(m.fecha)===mk; });
    var ing = mg.filter(function(m) { return m.tipo==="ingreso"; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
    var egr = mg.filter(function(m) { return m.tipo==="egreso";  }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
    var cats = CATS_EGRESO.map(function(c) {
      return Object.assign({},c,{ val: mg.filter(function(m) { return m.tipo==="egreso"&&m.cat===c.id; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0) });
    }).filter(function(c) { return c.val>0; }).sort(function(a,b) { return b.val-a.val; });
    var medios = getMedios().map(function(med) {
      return Object.assign({},med,{ val: mg.filter(function(m) { return m.tipo==="egreso"&&m.medio===med.id; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0) });
    }).filter(function(m) { return m.val>0; }).sort(function(a,b) { return b.val-a.val; });
    return { ing:ing, egr:egr, saldo:ing-egr, cats:cats, medios:medios, total:egr };
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function submit() {
    var m = Number(form.monto);
    if (!m||m<=0) return;
    if (form.tipo !== "ahorro" && !form.desc.trim()) return;
    if (form.tipo === "ahorro") {
      var ahorro = { id:form.editId||Date.now(), accion:form.accion, monto:m, moneda:form.moneda, desc:form.desc||"Ahorro", fecha:form.fecha, ts:Date.now() };
      if (form.editId) {
        setData(function(d) { return Object.assign({},d,{ ahorroManual:d.ahorroManual.map(function(a) { return a.id===form.editId?ahorro:a; }) }); });
      } else {
        setData(function(d) { return Object.assign({},d,{ ahorroManual:[ahorro].concat(d.ahorroManual) }); });
      }
    } else {
      var mov = { id:form.editId||Date.now(), tipo:form.tipo, desc:form.desc.trim(), monto:m, moneda:form.moneda, cat:form.cat, medio:form.tipo==="egreso"?form.medio:null, banco:form.tipo==="ingreso"?form.banco:null, fecha:form.fecha, ts:Date.now() };
      if (form.editId) {
        setData(function(d) { return Object.assign({},d,{ movs:d.movs.map(function(x) { return x.id===form.editId?mov:x; }) }); });
      } else {
        setData(function(d) { return Object.assign({},d,{ movs:[mov].concat(d.movs) }); });
      }
    }
    showFlash("✓ Guardado");
    setForm(Object.assign({}, addType==="egreso"?EMPTY_EGRESO:addType==="ingreso"?EMPTY_INGRESO:EMPTY_AHORRO));
    setTab("home");
  }
  function delMov(id) { setData(function(d) { return Object.assign({},d,{ movs:d.movs.filter(function(m) { return m.id!==id; }) }); }); }
  function delAhorro(id) { setData(function(d) { return Object.assign({},d,{ ahorroManual:d.ahorroManual.filter(function(a) { return a.id!==id; }) }); }); }
  function startEditMov(m) {
    setAddType(m.tipo);
    setForm({ tipo:m.tipo, desc:m.desc, monto:String(m.monto), moneda:m.moneda, cat:m.cat||"comida", medio:m.medio||"efectivo", banco:m.banco||"b1", fecha:m.fecha, editId:m.id });
    setTab("add");
  }
  function startEditAhorro(a) {
    setAddType("ahorro");
    setForm({ tipo:"ahorro", desc:a.desc, monto:String(a.monto), moneda:a.moneda, accion:a.accion, fecha:a.fecha, editId:a.id });
    setTab("add");
  }

  // ── PDF IMPORT ────────────────────────────────────────────────
  async function handlePDF(file) {
    setImportStep("loading");
    setImportError(null);
    try {
      var b64 = await fileToBase64(file);
      var catNames = CATS_EGRESO.map(function(c) { return c.id; }).join(", ");
      var rulesStr = Object.keys(rules).length > 0
        ? "Reglas aprendidas (aplicar siempre): " + JSON.stringify(rules)
        : "No hay reglas previas.";

      var systemPrompt = "Sos un asistente que extrae movimientos de resúmenes de tarjeta de crédito argentinos. " +
        "Devolvé SOLO un array JSON válido, sin texto adicional, sin markdown, sin explicaciones. " +
        "Cada elemento debe tener: desc (string, nombre del comercio/descripción), monto (number, siempre positivo), " +
        "moneda (ARS o USD), fecha (string dd/mm/yyyy), cat (una de: " + catNames + "). " +
        "Ignorá totales, subtotales, pagos, cuotas consolidadas y líneas que no sean gastos individuales. " +
        rulesStr;

      var response = await callClaude([{
        role: "user",
        content: [{
          type: "document",
          source: { type:"base64", media_type:"application/pdf", data:b64 }
        }, {
          type: "text",
          text: "Extraé todos los gastos individuales de este resumen de tarjeta. Devolvé solo el array JSON."
        }]
      }], systemPrompt);

      // parse JSON
      var clean = response.replace(/```json|```/g,"").trim();
      // find array in response
      var start = clean.indexOf("[");
      var end   = clean.lastIndexOf("]");
      if (start === -1 || end === -1) throw new Error("No se encontraron gastos en el PDF");
      var arr = JSON.parse(clean.slice(start, end+1));
      if (!Array.isArray(arr) || arr.length === 0) throw new Error("No se encontraron gastos en el PDF");

      // apply learned rules + add medio = importTarjeta
      var items = arr.map(function(item, i) {
        var key = (item.desc||"").toUpperCase().trim();
        var cat = rules[key] || item.cat || "varios";
        return { _id: Date.now()+i, desc:item.desc||"", monto:Number(item.monto)||0, moneda:item.moneda||"ARS", fecha:item.fecha||todayStr(), cat:cat, medio:importTarjeta, selected:true };
      });
      setImportItems(items);
      setImportStep("review");
    } catch(e) {
      setImportError("Error: " + e.message);
      setImportStep("upload");
    }
  }

  function updateImportItem(id, key, val) {
    setImportItems(function(items) {
      return items.map(function(item) {
        if (item._id !== id) return item;
        // if cat changed, save rule
        if (key === "cat") {
          var ruleKey = (item.desc||"").toUpperCase().trim();
          if (ruleKey) {
            setRules(function(r) { return Object.assign({},r,{[ruleKey]:val}); });
          }
        }
        return Object.assign({},item,{[key]:val});
      });
    });
  }

  function confirmImport() {
    var selected = importItems.filter(function(i) { return i.selected; });
    var newMovs = selected.map(function(i) {
      return { id:Date.now()+Math.random(), tipo:"egreso", desc:i.desc, monto:i.monto, moneda:i.moneda, cat:i.cat, medio:i.medio, fecha:i.fecha, ts:Date.now() };
    });
    setData(function(d) { return Object.assign({},d,{ movs:newMovs.concat(d.movs) }); });
    showFlash("✓ " + newMovs.length + " gastos importados");
    setImportStep("upload");
    setImportItems([]);
    setTab("home");
  }

  var isEditing = !!form.editId;
  var allRecent = movs.slice(0,30).map(function(m) { return Object.assign({},m,{_kind:"mov"}); })
    .concat(ahorroManual.slice(0,5).map(function(a) { return Object.assign({},a,{_kind:"ahorro"}); }))
    .sort(function(a,b) { return (b.ts||0)-(a.ts||0); }).slice(0,25);

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:BG, fontFamily:"'DM Sans','Segoe UI',sans-serif", color:T1, paddingBottom:80 }}>

      {/* HEADER */}
      <div style={{ background:CARD, borderBottom:"1px solid "+BORDER, padding:"22px 18px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:9, letterSpacing:3, color:T3, textTransform:"uppercase", marginBottom:2 }}>💰 Mis Finanzas</div>
          <div style={{ fontSize:20, fontWeight:800, color:T1 }}>Panel personal</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={function() { setImportStep("upload"); setImportItems([]); setImportError(null); setTab("import"); }} style={{ background:"#ede9fe", border:"none", borderRadius:10, color:ACC1, padding:"8px 12px", cursor:"pointer", fontSize:14, fontWeight:700 }}>📄 PDF</button>
          <button onClick={function() { setEcfg(Object.assign({},cfg)); setTab("cfg"); }} style={{ background:"#f8fafc", border:"1px solid "+BORDER, borderRadius:10, color:T2, padding:"8px 12px", cursor:"pointer", fontSize:16 }}>⚙️</button>
        </div>
      </div>

      {/* FLASH */}
      {flash && <div style={{ position:"fixed", top:18, left:"50%", transform:"translateX(-50%)", background:"#10b981", color:"#fff", borderRadius:12, padding:"9px 22px", fontWeight:700, zIndex:999, fontSize:12, boxShadow:"0 4px 20px rgba(16,185,129,.4)", whiteSpace:"nowrap" }}>{flash}</div>}

      {/* ══════════ HOME ══════════ */}
      {tab === "home" && (
        <div style={{ padding:"16px 16px" }}>
          <Card style={{ background:saldoMes>=0?"linear-gradient(135deg,#6366f1,#4f46e5)":"linear-gradient(135deg,#f43f5e,#e11d48)", border:"none", color:"#fff", padding:"22px 18px" }}>
            <div style={{ fontSize:9, letterSpacing:3, textTransform:"uppercase", marginBottom:4, opacity:0.8 }}>Saldo {mkLbl(nowKey)}</div>
            <div style={{ fontSize:38, fontWeight:900, letterSpacing:-1 }}>{fmtK(Math.abs(saldoMes))}</div>
            <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>{saldoMes>=0?"✓ En positivo":"⚠ En negativo"}</div>
          </Card>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            <Card style={{ margin:0, padding:"14px" }}>
              <div style={{ fontSize:10, color:ACC1, fontWeight:700, marginBottom:3 }}>📥 Ingresos</div>
              <div style={{ fontSize:18, fontWeight:800 }}>{fmtK(ingMes)}</div>
              <div style={{ fontSize:10, color:T3, marginTop:1 }}>este mes</div>
            </Card>
            <Card style={{ margin:0, padding:"14px" }}>
              <div style={{ fontSize:10, color:ACC3, fontWeight:700, marginBottom:3 }}>📤 Egresos</div>
              <div style={{ fontSize:18, fontWeight:800 }}>{fmtK(egrMes)}</div>
              <div style={{ fontSize:10, color:T3, marginTop:1 }}>este mes</div>
            </Card>
          </div>

          <Card style={{ background:"linear-gradient(135deg,#ecfdf5,#d1fae5)", border:"1px solid #a7f3d0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:10, color:ACC2, fontWeight:700, marginBottom:3 }}>🏦 Ahorros acumulados</div>
                <div style={{ fontSize:22, fontWeight:800, color:"#065f46" }}>{fmtK(totalAhorroMov)}</div>
                <div style={{ fontSize:10, color:"#059669", marginTop:2 }}>Sugerido este mes: {fmtK(saldoMes*0.2>0?saldoMes*0.2:0)}</div>
              </div>
              <button onClick={function() { setAddType("ahorro"); setForm(Object.assign({},EMPTY_AHORRO)); setTab("add"); }} style={{ background:"#10b981", border:"none", borderRadius:10, color:"#fff", padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:700 }}>+ Registrar</button>
            </div>
          </Card>

          {egrMes > 0 && (
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <SLabel>Gastos por categoría</SLabel>
                <Donut data={CATS_EGRESO.map(function(c) {
                  var val = movsMes.filter(function(m) { return m.tipo==="egreso"&&m.cat===c.id; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
                  return { val:val, color:c.color };
                }).filter(function(d) { return d.val>0; })} size={64} thick={14} />
              </div>
              {CATS_EGRESO.map(function(c) {
                var val = movsMes.filter(function(m) { return m.tipo==="egreso"&&m.cat===c.id; }).reduce(function(s,m) { return s+toARS(m.monto,m.moneda,cfg.usdRate); }, 0);
                if (!val) return null;
                return (
                  <div key={c.id} style={{ marginBottom:9 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:12, color:T2 }}>{c.emoji} {c.label}</span>
                      <div style={{ display:"flex", gap:8 }}>
                        <span style={{ fontSize:10, color:T3 }}>{(val/egrMes*100).toFixed(0)}%</span>
                        <span style={{ fontSize:12, fontWeight:700 }}>{fmtK(val)}</span>
                      </div>
                    </div>
                    <Bar pct={val/egrMes*100} color={c.color} />
                  </div>
                );
              })}
            </Card>
          )}

          <SLabel>Últimos movimientos</SLabel>
          {allRecent.length === 0 && (
            <div style={{ textAlign:"center", color:T3, padding:"28px 0", fontSize:13 }}>
              Sin movimientos todavía<br />
              <span style={{ fontSize:11 }}>Tocá ➕ o 📄 PDF para importar</span>
            </div>
          )}
          {allRecent.map(function(item) {
            if (item._kind === "ahorro") {
              return (
                <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, background:CARD, border:"1px solid "+BORDER, borderRadius:14, padding:"11px 13px", marginBottom:7 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:ACC2, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{item.accion==="deposito"?"Depósito ahorro":"Retiro ahorro"}</div>
                    <div style={{ fontSize:10, color:T3 }}>🏦 Ahorros · {item.fecha}</div>
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, color:item.accion==="deposito"?ACC2:ACC3 }}>{item.accion==="deposito"?"+":"-"}{fmt(item.monto,item.moneda)}</div>
                  <button onClick={function() { startEditAhorro(item); }} style={{ background:"#ede9fe", border:"none", borderRadius:7, color:ACC1, padding:"4px 7px", cursor:"pointer", fontSize:12 }}>✏️</button>
                  <button onClick={function() { delAhorro(item.id); }} style={{ background:"#fee2e2", border:"none", borderRadius:7, color:ACC3, padding:"4px 7px", cursor:"pointer", fontSize:12 }}>✕</button>
                </div>
              );
            }
            var cat = item.tipo==="egreso" ? catOf(item.cat) : null;
            var dotColor = item.tipo==="ingreso" ? ACC1 : cat ? cat.color : T3;
            return (
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, background:CARD, border:"1px solid "+BORDER, borderRadius:14, padding:"11px 13px", marginBottom:7 }}>
                <div style={{ width:9, height:9, borderRadius:"50%", background:dotColor, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.desc}</div>
                  <div style={{ fontSize:10, color:T3 }}>
                    {item.tipo==="egreso" ? (cat?cat.emoji+" "+cat.label:"")+" · "+getMedioLabel(item.medio) : "📥 "+getBancoLabel(item.banco)}
                    {" · "+item.fecha}{item.moneda==="USD"?" · USD":""}
                  </div>
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:item.tipo==="ingreso"?ACC1:ACC3 }}>{item.tipo==="ingreso"?"+":"-"}{fmt(item.monto,item.moneda)}</div>
                <button onClick={function() { startEditMov(item); }} style={{ background:"#ede9fe", border:"none", borderRadius:7, color:ACC1, padding:"4px 7px", cursor:"pointer", fontSize:12 }}>✏️</button>
                <button onClick={function() { delMov(item.id); }} style={{ background:"#fee2e2", border:"none", borderRadius:7, color:ACC3, padding:"4px 7px", cursor:"pointer", fontSize:12 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ IMPORT PDF ══════════ */}
      {tab === "import" && (
        <div style={{ padding:"22px 16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
            <button onClick={function() { setTab("home"); }} style={{ background:"#f8fafc", border:"1px solid "+BORDER, borderRadius:10, color:T2, padding:"6px 10px", cursor:"pointer", fontSize:14 }}>←</button>
            <div style={{ fontSize:16, fontWeight:800 }}>📄 Importar resumen</div>
          </div>

          {/* UPLOAD STEP */}
          {importStep === "upload" && (
            <div>
              {importError && (
                <div style={{ background:"#fee2e2", border:"1px solid #fecaca", borderRadius:14, padding:"12px 16px", marginBottom:14, fontSize:13, color:ACC3 }}>
                  {importError}
                </div>
              )}

              <Card>
                <SLabel>¿De qué tarjeta es el resumen?</SLabel>
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                  {[{ id:"t1", label:cfg.tarjetas[0] }, { id:"t2", label:cfg.tarjetas[1] }, { id:"t3", label:cfg.tarjetas[2] }].map(function(t) {
                    return (
                      <button key={t.id} onClick={function() { setImportTarjeta(t.id); }} style={{
                        padding:"12px 16px", borderRadius:12, cursor:"pointer", textAlign:"left", fontSize:14, fontWeight:600,
                        border:"1.5px solid "+(importTarjeta===t.id?ACC1:BORDER),
                        background:importTarjeta===t.id?"#ede9fe":"#f8fafc",
                        color:importTarjeta===t.id?ACC1:T2,
                      }}>💳 {t.label}</button>
                    );
                  })}
                </div>

                <input ref={fileRef} type="file" accept=".pdf" style={{ display:"none" }} onChange={function(e) {
                  var f = e.target.files && e.target.files[0];
                  if (f) handlePDF(f);
                }} />
                <button onClick={function() { fileRef.current && fileRef.current.click(); }} style={{
                  width:"100%", padding:"18px", borderRadius:16, border:"2px dashed "+ACC1,
                  background:"#ede9fe", color:ACC1, fontSize:15, fontWeight:700, cursor:"pointer",
                }}>
                  📎 Seleccionar PDF
                </button>
                <div style={{ fontSize:11, color:T3, textAlign:"center", marginTop:10 }}>
                  Claude va a leer el PDF y categorizar los gastos automáticamente
                </div>
              </Card>

              {Object.keys(rules).length > 0 && (
                <Card>
                  <SLabel>Reglas aprendidas ({Object.keys(rules).length})</SLabel>
                  <div style={{ maxHeight:160, overflowY:"auto" }}>
                    {Object.keys(rules).slice(0,20).map(function(k) {
                      var cat = catOf(rules[k]);
                      return (
                        <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid "+BORDER, fontSize:12 }}>
                          <span style={{ color:T2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{k}</span>
                          <span style={{ color:cat.color, fontWeight:700, marginLeft:8 }}>{cat.emoji} {cat.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {Object.keys(rules).length > 20 && <div style={{ fontSize:11, color:T3, marginTop:6, textAlign:"center" }}>...y {Object.keys(rules).length-20} más</div>}
                </Card>
              )}
            </div>
          )}

          {/* LOADING STEP */}
          {importStep === "loading" && (
            <div style={{ textAlign:"center", padding:"60px 0" }}>
              <div style={{ fontSize:40, marginBottom:16 }}>🤖</div>
              <div style={{ fontSize:16, fontWeight:700, color:T1, marginBottom:8 }}>Analizando el PDF...</div>
              <div style={{ fontSize:13, color:T3 }}>Claude está leyendo tu resumen y categorizando los gastos</div>
              <div style={{ marginTop:24, display:"flex", justifyContent:"center", gap:6 }}>
                {[0,1,2].map(function(i) {
                  return <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:ACC1, opacity:0.4+(i*0.3), animation:"none" }} />;
                })}
              </div>
            </div>
          )}

          {/* REVIEW STEP */}
          {importStep === "review" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{importItems.filter(function(i) { return i.selected; }).length} gastos encontrados</div>
                <button onClick={confirmImport} style={{ background:"linear-gradient(135deg,#6366f1,#4f46e5)", border:"none", borderRadius:12, color:"#fff", padding:"10px 20px", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                  ✓ Importar todos
                </button>
              </div>

              <div style={{ fontSize:11, color:T3, marginBottom:12 }}>Revisá y corregí las categorías si es necesario. Tus correcciones se aprenden para la próxima vez.</div>

              {importItems.map(function(item) {
                var cat = catOf(item.cat);
                return (
                  <Card key={item._id} style={{ padding:"12px 14px", opacity:item.selected?1:0.45 }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                      {/* checkbox */}
                      <button onClick={function() { updateImportItem(item._id, "selected", !item.selected); }} style={{ flexShrink:0, width:22, height:22, borderRadius:6, border:"2px solid "+(item.selected?ACC1:BORDER), background:item.selected?ACC1:"#f8fafc", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, marginTop:2 }}>
                        {item.selected ? "✓" : ""}
                      </button>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{item.desc}</div>
                        <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                          <span style={{ fontSize:12, fontWeight:700, color:item.moneda==="USD"?ACC2:T1 }}>{fmt(item.monto,item.moneda)}</span>
                          <span style={{ fontSize:11, color:T3 }}>·</span>
                          <span style={{ fontSize:11, color:T3 }}>{item.fecha}</span>
                        </div>
                        {/* category selector */}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
                          {CATS_EGRESO.map(function(c) {
                            return (
                              <button key={c.id} onClick={function() { updateImportItem(item._id, "cat", c.id); }} style={{
                                padding:"4px 9px", borderRadius:20, cursor:"pointer", fontSize:10, fontWeight:600,
                                border:"1.5px solid "+(item.cat===c.id?c.color:BORDER),
                                background:item.cat===c.id?c.color+"20":"#f8fafc",
                                color:item.cat===c.id?c.color:T3,
                              }}>{c.emoji} {c.label}</button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              <button onClick={confirmImport} style={{ width:"100%", padding:"15px", borderRadius:16, background:"linear-gradient(135deg,#6366f1,#4f46e5)", border:"none", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginTop:8 }}>
                ✓ Importar {importItems.filter(function(i) { return i.selected; }).length} gastos
              </button>
              <button onClick={function() { setImportStep("upload"); setImportItems([]); }} style={{ width:"100%", padding:"13px", borderRadius:14, marginTop:8, background:"#f8fafc", border:"1px solid "+BORDER, color:T2, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════ STATS ══════════ */}
      {tab === "stats" && (
        <div style={{ padding:"16px 16px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {[{ id:"cat", label:"📊 Categorías" }, { id:"medio", label:"💳 Medio de pago" }].map(function(t) {
              return (
                <button key={t.id} onClick={function() { setStab(t.id); }} style={{
                  padding:"11px 0", borderRadius:14, border:"none", cursor:"pointer", fontSize:12, fontWeight:700,
                  background:stab===t.id?"#ede9fe":"#f8fafc",
                  color:stab===t.id?ACC1:T3,
                  borderBottom:stab===t.id?"2px solid "+ACC1:"2px solid transparent",
                }}>{t.label}</button>
              );
            })}
          </div>
          {months.length === 0 && <div style={{ textAlign:"center", color:T3, padding:"40px 0", fontSize:13 }}>No hay datos aún.</div>}
          {months.map(function(mk) {
            var d = monthMovs(mk);
            return (
              <Card key={mk}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800 }}>{mkLbl(mk)}</div>
                    <div style={{ display:"flex", gap:10, marginTop:4 }}>
                      <span style={{ fontSize:11, color:ACC1, fontWeight:600 }}>+{fmtK(d.ing)}</span>
                      <span style={{ fontSize:11, color:ACC3, fontWeight:600 }}>-{fmtK(d.egr)}</span>
                      <span style={{ fontSize:11, color:d.saldo>=0?ACC2:ACC3, fontWeight:700 }}>{d.saldo>=0?"✓":"⚠"} {fmtK(Math.abs(d.saldo))}</span>
                    </div>
                  </div>
                  {stab==="cat" && <Donut data={d.cats.map(function(c) { return { val:c.val, color:c.color }; })} size={64} thick={14} />}
                </div>
                {stab==="cat" && d.cats.map(function(c) {
                  var pct = d.total>0?c.val/d.total*100:0;
                  return (
                    <div key={c.id} style={{ marginBottom:9 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontSize:12, color:T2 }}>{c.emoji} {c.label}</span>
                        <div style={{ display:"flex", gap:8 }}>
                          <span style={{ fontSize:10, color:T3 }}>{pct.toFixed(0)}%</span>
                          <span style={{ fontSize:12, fontWeight:700 }}>{fmtK(c.val)}</span>
                        </div>
                      </div>
                      <Bar pct={pct} color={c.color} />
                    </div>
                  );
                })}
                {stab==="medio" && d.medios.map(function(med) {
                  var pct = d.total>0?med.val/d.total*100:0;
                  return (
                    <div key={med.id} style={{ marginBottom:9 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontSize:12, color:T2 }}>{med.emoji} {med.label}</span>
                        <div style={{ display:"flex", gap:8 }}>
                          <span style={{ fontSize:10, color:T3 }}>{pct.toFixed(0)}%</span>
                          <span style={{ fontSize:12, fontWeight:700 }}>{fmtK(med.val)}</span>
                        </div>
                      </div>
                      <Bar pct={pct} color={ACC1} />
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}

      {/* ══════════ ADD ══════════ */}
      {tab === "add" && (
        <div style={{ padding:"22px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ fontSize:16, fontWeight:800 }}>{isEditing?"✏️ Editar":"➕ Nuevo movimiento"}</div>
            {isEditing && <button onClick={function() { setTab("home"); }} style={{ background:"#f8fafc", border:"1px solid "+BORDER, borderRadius:10, color:T3, padding:"6px 12px", cursor:"pointer", fontSize:12 }}>Cancelar</button>}
          </div>
          {!isEditing && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:18 }}>
              {[{ id:"egreso", label:"📤 Egreso", color:ACC3 }, { id:"ingreso", label:"📥 Ingreso", color:ACC1 }, { id:"ahorro", label:"🏦 Ahorro", color:ACC2 }].map(function(t) {
                return (
                  <button key={t.id} onClick={function() { setAddType(t.id); setForm(Object.assign({},t.id==="egreso"?EMPTY_EGRESO:t.id==="ingreso"?EMPTY_INGRESO:EMPTY_AHORRO)); }} style={{
                    padding:"11px 0", borderRadius:14, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                    background:addType===t.id?t.color+"15":"#f8fafc",
                    color:addType===t.id?t.color:T3,
                    borderBottom:addType===t.id?"2px solid "+t.color:"2px solid transparent",
                  }}>{t.label}</button>
                );
              })}
            </div>
          )}
          {addType !== "ahorro" && (
            <div style={{ marginBottom:14 }}>
              <SLabel>Descripción</SLabel>
              <input value={form.desc} onChange={function(e) { setF("desc",e.target.value); }} placeholder="Ej: Sueldo, supermercado..." style={INP_S} />
            </div>
          )}
          <div style={{ marginBottom:14 }}>
            <SLabel>Monto</SLabel>
            <div style={{ display:"flex", gap:8 }}>
              <input type="number" value={form.monto} onChange={function(e) { setF("monto",e.target.value); }} placeholder="0.00" style={Object.assign({},INP_S,{ fontSize:22, fontWeight:900, flex:1 })} />
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {["ARS","USD"].map(function(mon) {
                  return <button key={mon} onClick={function() { setF("moneda",mon); }} style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid "+(form.moneda===mon?ACC1:BORDER), background:form.moneda===mon?"#ede9fe":"#f8fafc", color:form.moneda===mon?ACC1:T3, fontWeight:700, fontSize:12, cursor:"pointer" }}>{mon}</button>;
                })}
              </div>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <SLabel>Fecha</SLabel>
            <input type="date" value={dateToInput(form.fecha)} onChange={function(e) { setF("fecha",inputToDate(e.target.value)); }} style={Object.assign({},INP_S,{ colorScheme:"light" })} />
          </div>
          {addType === "ahorro" && (
            <div style={{ marginBottom:14 }}>
              <SLabel>Tipo</SLabel>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[{ id:"deposito", label:"➕ Depositar" }, { id:"retiro", label:"➖ Retirar" }].map(function(a) {
                  return <button key={a.id} onClick={function() { setF("accion",a.id); }} style={{ padding:"12px", borderRadius:12, border:"1.5px solid "+(form.accion===a.id?ACC2:BORDER), background:form.accion===a.id?"#d1fae5":"#f8fafc", color:form.accion===a.id?"#065f46":T3, fontWeight:700, fontSize:13, cursor:"pointer" }}>{a.label}</button>;
                })}
              </div>
            </div>
          )}
          {addType === "ingreso" && (
            <div style={{ marginBottom:14 }}>
              <SLabel>Banco</SLabel>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[{ id:"b1", label:cfg.bancos[0] }, { id:"b2", label:cfg.bancos[1] }].map(function(b) {
                  return <button key={b.id} onClick={function() { setF("banco",b.id); }} style={{ padding:"12px", borderRadius:12, border:"1.5px solid "+(form.banco===b.id?ACC1:BORDER), background:form.banco===b.id?"#ede9fe":"#f8fafc", color:form.banco===b.id?ACC1:T3, fontWeight:700, fontSize:13, cursor:"pointer" }}>🏦 {b.label}</button>;
                })}
              </div>
            </div>
          )}
          {addType === "ingreso" && (
            <div style={{ marginBottom:14 }}>
              <SLabel>Categoría</SLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {CATS_INGRESO.map(function(c) { return <Pill key={c.id} active={form.cat===c.id} color={ACC1} onClick={function() { setF("cat",c.id); }}>{c.emoji} {c.label}</Pill>; })}
              </div>
            </div>
          )}
          {addType === "egreso" && (
            <div style={{ marginBottom:14 }}>
              <SLabel>Categoría</SLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {CATS_EGRESO.map(function(c) { return <Pill key={c.id} active={form.cat===c.id} color={c.color} onClick={function() { setF("cat",c.id); }}>{c.emoji} {c.label}</Pill>; })}
              </div>
            </div>
          )}
          {addType === "egreso" && (
            <div style={{ marginBottom:24 }}>
              <SLabel>Medio de pago</SLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {getMedios().map(function(med) { return <Pill key={med.id} active={form.medio===med.id} color={ACC1} onClick={function() { setF("medio",med.id); }}>{med.emoji} {med.label}</Pill>; })}
              </div>
            </div>
          )}
          <button onClick={submit} style={{ width:"100%", padding:"15px", borderRadius:16, background:addType==="egreso"?"linear-gradient(135deg,#f43f5e,#e11d48)":addType==="ingreso"?"linear-gradient(135deg,#6366f1,#4f46e5)":"linear-gradient(135deg,#10b981,#059669)", border:"none", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
            {isEditing?"Guardar cambios":"Guardar"}
          </button>
          {isEditing && (
            <button onClick={function() { if(form.tipo==="ahorro"){delAhorro(form.editId);}else{delMov(form.editId);} setTab("home"); }} style={{ width:"100%", padding:"13px", borderRadius:14, marginTop:10, background:"#fee2e2", border:"1.5px solid #fecaca", color:ACC3, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              🗑️ Eliminar
            </button>
          )}
        </div>
      )}

      {/* ══════════ CONFIG ══════════ */}
      {tab === "cfg" && ecfg && (
        <div style={{ padding:"22px 16px" }}>
          <div style={{ fontSize:16, fontWeight:800, marginBottom:20 }}>⚙️ Configuración</div>
          <SLabel>Mis bancos</SLabel>
          {[0,1].map(function(i) {
            return <input key={i} value={ecfg.bancos[i]} onChange={function(e) { var val=e.target.value; setEcfg(function(c) { var b=c.bancos.slice(); b[i]=val; return Object.assign({},c,{bancos:b}); }); }} placeholder={"Banco "+(i+1)} style={Object.assign({},INP_S,{marginBottom:8})} />;
          })}
          <SLabel style={{ marginTop:12 }}>Mis tarjetas</SLabel>
          {[0,1,2].map(function(i) {
            return <input key={i} value={ecfg.tarjetas[i]} onChange={function(e) { var val=e.target.value; setEcfg(function(c) { var t=c.tarjetas.slice(); t[i]=val; return Object.assign({},c,{tarjetas:t}); }); }} placeholder={"Tarjeta "+(i+1)} style={Object.assign({},INP_S,{marginBottom:8})} />;
          })}
          <SLabel style={{ marginTop:12 }}>Tipo de cambio USD → ARS</SLabel>
          <input type="number" value={ecfg.usdRate} onChange={function(e) { var val=Number(e.target.value); setEcfg(function(c) { return Object.assign({},c,{usdRate:val}); }); }} style={INP_S} />
          <button onClick={function() { setCfg(ecfg); setTab("home"); showFlash("Configuración guardada"); }} style={{ width:"100%", padding:"13px", borderRadius:14, marginTop:16, background:"linear-gradient(135deg,#6366f1,#4f46e5)", border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
            Guardar configuración
          </button>
          <div style={{ marginTop:28, borderTop:"1px solid "+BORDER, paddingTop:22 }}>
            <div style={{ fontSize:9, letterSpacing:3, textTransform:"uppercase", color:ACC3, marginBottom:8, fontWeight:700 }}>Zona de peligro</div>
            <button onClick={function() { if(window.confirm("¿Borrar todos los datos?")){ setData({movs:[],ahorroManual:[]}); setTab("home"); } }} style={{ width:"100%", padding:"13px", borderRadius:14, background:"#fee2e2", border:"1.5px solid #fecaca", color:ACC3, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:8 }}>
              🗑️ Borrar todos los datos
            </button>
            <button onClick={function() { if(window.confirm("¿Borrar todas las reglas aprendidas?")){ setRules({}); showFlash("Reglas borradas"); } }} style={{ width:"100%", padding:"13px", borderRadius:14, background:"#fef9c3", border:"1.5px solid #fde68a", color:"#92400e", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              🧹 Borrar reglas aprendidas
            </button>
          </div>
        </div>
      )}

      {/* NAV */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(255,255,255,.97)", backdropFilter:"blur(20px)", borderTop:"1px solid "+BORDER, display:"flex", justifyContent:"space-around", padding:"9px 0" }}>
        {[{ id:"home", icon:"🏠", label:"Inicio" }, { id:"stats", icon:"📈", label:"Stats" }, { id:"add", icon:"➕", label:"Agregar" }].map(function(t) {
          return (
            <button key={t.id} onClick={function() { if(t.id==="add"){ setAddType("egreso"); setForm(Object.assign({},EMPTY_EGRESO)); } setTab(t.id); }} style={{ background:"none", border:"none", color:tab===t.id?ACC1:T3, display:"flex", flexDirection:"column", alignItems:"center", gap:2, cursor:"pointer", padding:"3px 18px" }}>
              <span style={{ fontSize:19 }}>{t.icon}</span>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:1 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}