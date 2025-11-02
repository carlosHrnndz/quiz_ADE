// ====== CONFIG ======
const MODULE_MIN = 1, MODULE_MAX = 30;  // Modulo01..Modulo30
const UNIT_MIN   = 1, UNIT_MAX   = 60;  // unidad_01..unidad_60
const EXAM_COUNT = 40;                  // preguntas en modo examen

// ====== STATE ======
let bank = [];                  // [{gid, texto, opciones, correcta}]
let order = [];                 // índices del banco para el pase actual
let idx = 0;                    // puntero en 'order'
let mode = "repaso";            // 'repaso' | 'examen' | 'errores'
let name = "";
let moduleId = null;

// progreso
const selections = new Map();   // gid -> 'a'|'b'|'c'|'d' (última selección)
const finalized  = new Map();   // gid -> selección consolidada al pasar de pregunta
const wrongSet   = new Set();   // gid marcados como "erróneos" (fallados en finalizadas)
const pendingSet = new Set();   // gid marcados manualmente como "pendiente"

// ====== DOM ======
const $ = id => document.getElementById(id);
const el = {
  userNameHead: $("userNameHead"),
  moduloSelect: $("moduloSelect"),
  nameInput: $("nameInput"),
  saveNameBtn: $("saveNameBtn"),

  mainMenu: $("mainMenu"),
  setupBar: $("setupBar"),

  btnRepaso: $("btnRepaso"),
  btnExamen: $("btnExamen"),
  btnErrores: $("btnErrores"),
  btnStats:  $("btnStats"),

  quizView: $("quizView"),
  qCounter: $("qCounter"),
  scoreMini: $("scoreMini"),
  qText: $("qText"),
  options: $("options"),
  feedback: $("feedback"),
  btnAnt: $("btnAnt"),
  btnSig: $("btnSig"),
  btnPend: $("btnPend"),
  btnFin: $("btnFin"),
  pendCount: $("pendCount"),

  statsView: $("statsView"),
  ansCount: $("ansCount"),
  totalCount: $("totalCount"),
  pctOK: $("pctOK"),
  errCount: $("errCount"),
  btnBackMenu: $("btnBackMenu"),

  detectedMsg: $("detectedMsg"),
};

function pad2(n){ return String(n).padStart(2,"0"); }
const gidOf = (mod,u,i) => `${mod}|${pad2(u)}|${i}`;

// ====== PERSISTENCIA ======
const KEY = "quiz_clone_app_examen_v1";
function saveState(){
  const payload = {
    name, moduleId, selections: Array.from(selections.entries()),
    finalized: Array.from(finalized.entries()),
    wrong: Array.from(wrongSet), pending: Array.from(pendingSet)
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}
function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return;
    const p = JSON.parse(raw);
    name = p.name || name;
    moduleId = p.moduleId || moduleId;
    selections.clear(); (p.selections||[]).forEach(([g,v])=>selections.set(g,v));
    finalized.clear();  (p.finalized ||[]).forEach(([g,v])=>finalized.set(g,v));
    wrongSet.clear();   (p.wrong     ||[]).forEach(g=>wrongSet.add(g));
    pendingSet.clear(); (p.pending   ||[]).forEach(g=>pendingSet.add(g));
  }catch{}
}

// ====== DETECCIÓN DE MÓDULOS ======
async function existsJson(url){
  try{ const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"}); if(!r.ok) return false; await r.clone().json(); return true; }
  catch{ return false; }
}
async function detectModules(){
  el.moduloSelect.innerHTML = `<option>Detectando…</option>`;
  const found = [];
  for(let m=MODULE_MIN; m<=MODULE_MAX; m++){
    const id = `Modulo${pad2(m)}`;
    let any = false;
    for(let u=UNIT_MIN; u<UNIT_MIN+5 && u<=UNIT_MAX; u++){
      if(await existsJson(`${id}/unidad_${pad2(u)}.json`)){ any = true; break; }
    }
    if(any) found.push(id);
  }
  if(!found.length){
    el.moduloSelect.innerHTML = `<option>No se encontraron módulos</option>`;
    el.detectedMsg.textContent = "No hay ModuloXX con unidad_YY.json accesibles en este repositorio.";
    return;
  }
  el.moduloSelect.innerHTML = found.map(m=>`<option value="${m}">${m}</option>`).join("");
  el.detectedMsg.textContent = `Detectados: ${found.join(", ")}`;
  if(!moduleId) moduleId = found[0];
  el.moduloSelect.value = moduleId;
}

// ====== CARGA DEL BANCO ======
async function loadModuleBank(modId){
  const all = [];
  for(let u=UNIT_MIN; u<=UNIT_MAX; u++){
    const url = `${modId}/unidad_${pad2(u)}.json`;
    try{
      const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"}); if(!r.ok) continue;
      const data = await r.json();
      const preguntas = data?.preguntas || data || [];
      preguntas.forEach((q,i)=>{
        all.push({
          gid: gidOf(modId, u, i),
          texto: q.pregunta || q.texto || "",
          opciones: q.opciones || q.options || {},
          correcta: (q.respuesta_correcta || q.correcta || "").toString().trim().toLowerCase(),
        });
      });
    }catch{}
  }
  return all;
}

// ====== UTIL DE ORDEN ======
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

function makeOrderAll(){ order = bank.map((_,i)=>i); shuffle(order); idx = 0; }
function makeOrderExam(){
  const all = bank.map((_,i)=>i); shuffle(all);
  order = all.slice(0, Math.min(EXAM_COUNT, all.length));
  idx = 0;
}
function makeOrderErrors(){
  // “Errores” = falladas + pendientes
  const errGids = new Set([...wrongSet, ...pendingSet]);
  const idxs = bank.map((q,i)=>({i,q})).filter(x=>errGids.has(x.q.gid)).map(x=>x.i);
  order = shuffle(idxs);
  idx = 0;
}

// ====== UI ======
function show(elm){ elm.classList.remove("hidden"); }
function hide(elm){ elm.classList.add("hidden"); }

function updateHeader(){
  el.userNameHead.textContent = name || "";
  el.pendCount.textContent = pendingSet.size;
}

function renderStats(){
  const total = bank.length;
  const answered = finalized.size;
  const ok = Array.from(finalized.entries()).reduce((acc,[gid,sel])=>{
    const q = bank.find(x=>x.gid===gid); return acc + (q && sel.toLowerCase()===q.correcta ? 1 : 0);
  },0);
  const pct = total ? Math.round(ok*100/answered || 0) : 0;
  const err = new Set([...wrongSet, ...pendingSet]).size;

  el.ansCount.textContent = answered;
  el.totalCount.textContent = total;
  el.pctOK.textContent = pct;
  el.errCount.textContent = err;
}

function renderQuestion(){
  if(!order.length){ // sin preguntas en este modo
    hide(el.quizView); show(el.statsView); renderStats(); return;
  }
  const q = bank[order[idx]];
  el.qCounter.textContent = `Pregunta ${idx+1} / ${order.length}`;

  // mini score
  const okNow = Array.from(finalized.entries()).reduce((acc,[gid,sel])=>{
    const qq = bank.find(x=>x.gid===gid);
    return acc + (qq && sel.toLowerCase()===qq.correcta ? 1 : 0);
  },0);
  el.scoreMini.textContent = `Aciertos: ${okNow}`;

  el.qText.textContent = q.texto || "Pregunta sin texto";
  el.options.innerHTML = "";

  const sel = selections.get(q.gid) || null;
  const fin = finalized.has(q.gid);

  Object.entries(q.opciones).forEach(([k,v])=>{
    const id = `opt_${k}`;
    const lab = document.createElement("label");
    lab.className = "option";
    lab.htmlFor = id;
    lab.innerHTML = `<input type="radio" name="opt" id="${id}" value="${k}"> <div><strong>${k.toUpperCase()}.</strong> ${v}</div>`;
    const input = lab.querySelector("input");
    if(sel === k) input.checked = true;

    input.addEventListener("change", ()=>{
      selections.set(q.gid, k);
      // feedback inmediato solo en "repaso"
      if(mode === "repaso"){
        const isOK = k.toLowerCase() === q.correcta;
        el.options.querySelectorAll(".option").forEach(o=>o.classList.remove("correct","incorrect"));
        lab.classList.add(isOK? "correct" : "incorrect");
        el.feedback.textContent = isOK ? "✅ ¡Correcto!" : `❌ Incorrecto. Correcta: ${q.correcta.toUpperCase()}`;
      }else{
        el.feedback.textContent = "";
        el.options.querySelectorAll(".option").forEach(o=>o.classList.remove("correct","incorrect"));
      }
      saveState();
    });

    // si estaba finalizada y estamos en repaso, pinta colores
    if(fin && mode === "repaso"){
      if(k.toLowerCase() === q.correcta) lab.classList.add("correct");
      if(sel && sel === k && k.toLowerCase() !== q.correcta) lab.classList.add("incorrect");
    }

    el.options.appendChild(lab);
  });

  // feedback persistente
  if(mode === "repaso" && sel){
    el.feedback.textContent = sel.toLowerCase() === q.correcta ? "✅ ¡Correcto!" : `❌ Incorrecto. Correcta: ${q.correcta.toUpperCase()}`;
  } else {
    el.feedback.textContent = "";
  }

  updateHeader();
  saveState();
}

// ====== NAV ======
function finalizeCurrent(){
  const q = bank[order[idx]];
  const sel = selections.get(q.gid) || null;
  if(sel){
    finalized.set(q.gid, sel);
    // recalcular wrong
    if(sel.toLowerCase() !== q.correcta) wrongSet.add(q.gid);
    else wrongSet.delete(q.gid);
  }
}

function nextQ(){
  finalizeCurrent();
  if(idx < order.length-1){ idx++; renderQuestion(); }
  else { showEnd(); }
}
function prevQ(){
  if(idx>0){ idx--; renderQuestion(); }
}
function markPending(){
  const q = bank[order[idx]];
  pendingSet.add(q.gid);
  updateHeader(); saveState();
}
function showEnd(){
  hide(el.quizView); show(el.statsView); renderStats();
}

// ====== FLOWS ======
async function ensureBankLoaded(){
  const selMod = el.moduloSelect.value;
  if(!selMod) return alert("Selecciona un módulo.");
  moduleId = selMod;
  bank = await loadModuleBank(moduleId);
  if(!bank.length){ alert("No se encontraron preguntas para este módulo."); return false; }
  return true;
}

async function startRepaso(){
  if(!(await ensureBankLoaded())) return;
  mode = "repaso";
  makeOrderAll();
  hide(el.mainMenu); hide(el.statsView);
  show(el.quizView);
  renderQuestion();
}
async function startExamen(){
  if(!(await ensureBankLoaded())) return;
  mode = "examen";
  makeOrderExam();
  hide(el.mainMenu); hide(el.statsView);
  show(el.quizView);
  renderQuestion();
}
async function startErrores(){
  if(!(await ensureBankLoaded())) return;
  mode = "errores";
  makeOrderErrors();
  hide(el.mainMenu); hide(el.statsView);
  show(el.quizView);
  renderQuestion();
}
function openStats(){
  hide(el.quizView); show(el.statsView); renderStats();
}
function backMenu(){
  hide(el.statsView); show(el.mainMenu);
}

// ====== INIT ======
window.addEventListener("DOMContentLoaded", async ()=>{
  loadState();

  // nombre
  if(name){ el.nameInput.value = name; el.userNameHead.textContent = name; }
  el.saveNameBtn.addEventListener("click", ()=>{
    const v = (el.nameInput.value||"").trim();
    if(!v) return alert("Escribe tu nombre.");
    name = v; el.userNameHead.textContent = name; saveState();
  });

  // módulos
  await detectModules();
  if(moduleId) el.moduloSelect.value = moduleId;
  el.moduloSelect.addEventListener("change", e=>{ moduleId = e.target.value; saveState(); });

  // menú
  el.btnRepaso.addEventListener("click", startRepaso);
  el.btnExamen.addEventListener("click", startExamen);
  el.btnErrores.addEventListener("click", startErrores);
  el.btnStats .addEventListener("click", openStats);

  // navegación
  el.btnSig.addEventListener("click", nextQ);
  el.btnAnt.addEventListener("click", prevQ);
  el.btnPend.addEventListener("click", markPending);
  el.btnFin.addEventListener("click", showEnd);
  el.btnBackMenu.addEventListener("click", backMenu);

  // hotkey "F" para Ver Fin
  document.addEventListener("keydown", (ev)=>{
    if((ev.key||"").toLowerCase()==="f") showEnd();
  });

  // pinta contadores iniciales
  updateHeader();
});
