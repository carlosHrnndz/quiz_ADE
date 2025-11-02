// ===== Config =====
const MODULE_MIN = 1, MODULE_MAX = 30;   // Modulo01..Modulo30
const UNIT_MIN   = 1, UNIT_MAX   = 60;   // unidad_01..unidad_60

// ===== Estado =====
let state = {
  name: "",
  moduleId: null,
  mode: "study", // 'study' | 'exam'
  questions: [],       // [{texto, opciones, correcta, gid}]
  order: [],           // índices del banco actual (para “solo pendientes” o barajar en examen)
  idx: 0,              // índice dentro de order
  selections: new Map(),   // gid -> 'a'|'b'|'c'|'d' (selección provisional)
  finalized: new Map(),    // gid -> 'a'|'b'|'c'|'d' (finalizada al pasar con Siguiente)
  score: 0,
  pending: new Set(),      // gid pendientes
};

// ===== Helpers DOM =====
const $ = id => document.getElementById(id);
const els = {
  toolbar: $("toolbar"),
  pills: $("pills"), pillModulo: $("pillModulo"), pillStats: $("pillStats"),

  askName: $("askName"), nameInput: $("nameInput"), saveNameBtn: $("saveNameBtn"),
  intro: $("intro"), quiz: $("quiz"), results: $("results"),

  moduloSelect: $("moduloSelect"), mode: $("mode"),
  startBtn: $("startBtn"), continueBtn: $("continueBtn"), pendingOnlyBtn: $("pendingOnlyBtn"),
  resetBtn: $("resetBtn"),

  markPendingBtn: $("markPendingBtn"),
  prevBtn: $("prevBtn"), nextBtn: $("nextBtn"),
  restartBtn: $("restartBtn"), startPendingFromResults: $("startPendingFromResults"),

  qText: $("q-text"), options: $("options"), feedback: $("feedback"),
  progress: $("progress"), score: $("score"), pendingCount: $("pendingCount"),
  finalScore: $("finalScore"), reviewList: $("reviewList"),
  detectMsg: $("detectMsg"),
};
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

// ===== Util =====
const pad2 = n => String(n).padStart(2,"0");
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
const gidOf = (modId,u,i) => `${modId}|${pad2(u)}|${i}`;

// ===== Persistencia =====
const KEY = "quiz_rrhh_nav_v1";
function saveProgress(){
  const payload = {
    name: state.name, moduleId: state.moduleId, mode: state.mode,
    order: state.order, idx: state.idx, score: state.score,
    selections: Array.from(state.selections.entries()),
    finalized: Array.from(state.finalized.entries()),
    pending: Array.from(state.pending),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}
function loadProgress(){
  try{ const raw = localStorage.getItem(KEY); return raw?JSON.parse(raw):null; }catch{ return null; }
}
function clearProgress(){ localStorage.removeItem(KEY); }

// ===== Nombre =====
function ensureName(){
  const saved = loadProgress();
  if(saved?.name){ state.name = saved.name; hide(els.askName); return true; }
  const mem = localStorage.getItem("quizName");
  if(mem){ state.name = mem; hide(els.askName); return true; }
  show(els.askName); return false;
}
els.saveNameBtn.addEventListener("click", ()=>{
  const v = (els.nameInput.value||"").trim();
  if(!v) return alert("Escribe tu nombre.");
  state.name = v; localStorage.setItem("quizName", v); hide(els.askName);
  alert(`¡Hola, ${state.name}!`);
});

// ===== Detección de módulos =====
async function existsJson(url){
  try{ const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"}); if(!r.ok) return false; await r.clone().json(); return true; }
  catch{ return false; }
}
async function detectModules(){
  els.moduloSelect.innerHTML = `<option value="">Detectando…</option>`;
  const found = [];
  for(let m=MODULE_MIN; m<=MODULE_MAX; m++){
    const modId = `Modulo${pad2(m)}`;
    // probar varias unidades “rápidas”
    let any=false;
    for(let k=UNIT_MIN; k<UNIT_MIN+5 && k<=UNIT_MAX; k++){
      if(await existsJson(`${modId}/unidad_${pad2(k)}.json`)){ any=true; break; }
    }
    if(any) found.push(modId);
  }
  if(!found.length){
    els.moduloSelect.innerHTML = `<option value="">No se encontraron módulos</option>`;
    els.detectMsg.textContent = "No hay ModuloXX con unidad_YY.json accesibles.";
    return;
  }
  els.moduloSelect.innerHTML = found.map(m=>`<option value="${m}">${m}</option>`).join("");
  els.detectMsg.textContent = `Detectados: ${found.join(", ")}`;
}

// ===== Carga de preguntas =====
async function loadModuleQuestions(modId){
  const all = [];
  for(let u=UNIT_MIN; u<=UNIT_MAX; u++){
    const url = `${modId}/unidad_${pad2(u)}.json`;
    try{
      const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"}); if(!r.ok) continue;
      const data = await r.json();
      const preguntas = data?.preguntas || data || [];
      preguntas.forEach((q,i)=>{
        all.push({
          texto: q.pregunta || q.texto || "",
          opciones: q.opciones || q.options || {},
          correcta: (q.respuesta_correcta || q.correcta || "").toString().trim().toLowerCase(),
          gid: gidOf(modId,u,i)
        });
      });
    }catch{}
  }
  return all;
}

// ===== Construcción del pase =====
function buildOrder({onlyPending=false}={}){
  const idxs = state.questions.map((_,i)=>i);
  let order = idxs;
  if(onlyPending){
    order = idxs.filter(i => state.pending.has(state.questions[i].gid));
  }
  if(state.mode === "exam") shuffle(order);
  state.order = order;
  if(state.idx >= order.length) state.idx = 0;
  recomputeScore(); // por si había finalizadas previas
  updatePills();
}

function updatePills(){
  const total = state.questions.length;
  const answered = state.finalized.size;
  const pend = state.pending.size;
  els.pillModulo.textContent = `Módulo: ${state.moduleId ?? "—"}`;
  els.pillStats.textContent  = `${answered} respondidas · ${pend} pendientes · ${total} totales`;
  els.pendingCount.textContent = `Pendientes: ${pend}`;
}

function recomputeScore(){
  let s = 0;
  for(const [gid,sel] of state.finalized.entries()){
    const q = state.questions.find(x=>x.gid===gid);
    if(q && (sel||"").toLowerCase() === q.correcta) s++;
  }
  state.score = s;
}

// ===== Render =====
function renderQuestion(){
  if(state.order.length === 0){ showResults(); return; }
  const qIndex = state.order[state.idx];
  const q = state.questions[qIndex];

  // header y contadores
  els.progress.textContent = `Pregunta ${state.idx+1} / ${state.order.length}`;
  els.score.textContent = `Aciertos: ${state.score}`;
  updatePills();

  // texto
  els.qText.textContent = q.texto || "Pregunta sin texto";

  // opciones
  els.options.innerHTML = "";
  const sel = state.selections.get(q.gid) || null;
  const fin = state.finalized.has(q.gid);

  Object.entries(q.opciones).forEach(([k,v])=>{
    const id = `opt_${k}`;
    const lab = document.createElement("label");
    lab.className = "option"; lab.htmlFor = id;
    lab.innerHTML = `<input type="radio" name="opt" id="${id}" value="${k}"> <div><strong>${k.toUpperCase()}.</strong> ${v}</div>`;
    const input = lab.querySelector("input");
    if(sel && sel === k) input.checked = true;

    // Al cambiar selección: NO avanzamos. Solo mostramos feedback en estudio.
    input.addEventListener("change", ()=>{
      state.selections.set(q.gid, k);
      if(state.mode === "study"){
        const ok = k.toLowerCase() === q.correcta;
        // marcar estilos de feedback
        els.options.querySelectorAll(".option").forEach(l=>{
          l.classList.remove("correct","incorrect");
        });
        lab.classList.add(ok? "correct" : "incorrect");
        els.feedback.textContent = ok ? "✅ ¡Correcto!" : `❌ Incorrecto. Correcta: ${q.correcta.toUpperCase()}`;
      }else{
        // examen: sin feedback
        els.feedback.textContent = "";
      }
      saveProgress();
    });

    // Si estaba finalizada y en estudio, muestra colores
    if(fin && state.mode === "study"){
      if(k.toLowerCase() === q.correcta) lab.classList.add("correct");
      if(sel && sel === k && k.toLowerCase() !== q.correcta) lab.classList.add("incorrect");
    }

    els.options.appendChild(lab);
  });

  // feedback
  if(state.mode === "study" && sel){
    const ok = sel.toLowerCase() === q.correcta;
    els.feedback.textContent = ok ? "✅ ¡Correcto!" : `❌ Incorrecto. Correcta: ${q.correcta.toUpperCase()}`;
  }else{
    els.feedback.textContent = "";
  }

  saveProgress();
}

// ===== Navegación =====
function finalizeCurrentIfNeeded(){
  const qIndex = state.order[state.idx];
  const q = state.questions[qIndex];
  const sel = state.selections.get(q.gid) || null;
  if(sel){ state.finalized.set(q.gid, sel); } // fija la respuesta al pasar
  // Nota: si no hubo selección, no finaliza nada.
  recomputeScore();
}

function next(){
  finalizeCurrentIfNeeded();
  state.idx++;
  if(state.idx >= state.order.length){ showResults(); }
  else renderQuestion();
}

function prev(){
  if(state.idx === 0) return;
  state.idx--;
  renderQuestion();
}

// ===== Pendientes =====
function markPending(){
  const qIndex = state.order[state.idx];
  const q = state.questions[qIndex];
  state.pending.add(q.gid);
  updatePills();
  saveProgress();
}

// ===== Resultados =====
function showResults(){
  hide(els.quiz); show(els.results);
  const name = state.name ? `, ${state.name}` : "";
  els.finalScore.textContent = `Puntuación${name}: ${state.score} / ${state.order.length}`;

  els.reviewList.innerHTML = "";
  // Orden de revisión en el orden del pase
  state.order.forEach(i=>{
    const q = state.questions[i];
    const sel = state.finalized.get(q.gid) || state.selections.get(q.gid) || "-";
    const ok = sel.toLowerCase() === q.correcta;
    const li = document.createElement("li");
    li.innerHTML = `<div><strong>${q.texto}</strong></div>
      <div>Tu respuesta: <code>${(sel||'?').toUpperCase()}</code> · Correcta: <code>${q.correcta.toUpperCase()}</code> ${ok?'✅':'❌'}</div>`;
    els.reviewList.appendChild(li);
  });

  updatePills();
  saveProgress();
}

// ===== Flujos =====
async function startFresh(){
  if(!ensureName()) return alert("Escribe tu nombre y pulsa Guardar.");
  const modId = els.moduloSelect.value; if(!modId) return alert("Selecciona un módulo.");
  state.moduleId = modId;
  state.mode = els.mode.value;

  // UI: ocultar barra de configuración; mostrar pills
  hide(els.toolbar); show(els.pills);

  // Carga silenciosa
  state.questions = await loadModuleQuestions(modId);
  if(!state.questions.length){ show(els.toolbar); hide(els.pills); alert("No hay preguntas en este módulo."); return; }

  // reset de estructuras
  state.order = []; state.idx = 0;
  state.selections.clear(); state.finalized.clear();
  state.pending = state.pending || new Set();

  buildOrder({onlyPending:false});
  hide(els.results); hide(els.intro); show(els.quiz);
  renderQuestion();
}

function continueSaved(){
  const raw = loadProgress(); if(!raw) return;
  state.name = raw.name;
  state.moduleId = raw.moduleId; state.mode = raw.mode;
  state.order = raw.order || []; state.idx = raw.idx || 0;
  state.score = raw.score || 0;
  state.selections = new Map(raw.selections || []);
  state.finalized = new Map(raw.finalized || []);
  state.pending = new Set(raw.pending || []);

  hide(els.toolbar); show(els.pills);
  hide(els.results); hide(els.intro); show(els.quiz);
  // necesitamos el banco:
  loadModuleQuestions(state.moduleId).then(qs=>{
    state.questions = qs;
    updatePills();
    renderQuestion();
  });
}

function startPending(){
  const raw = loadProgress();
  if(raw?.moduleId){ state.moduleId = raw.moduleId; }
  if(!state.moduleId) return alert("No hay módulo cargado/guardado.");

  hide(els.toolbar); show(els.pills);
  loadModuleQuestions(state.moduleId).then(qs=>{
    state.questions = qs;
    state.mode = els.mode.value || raw?.mode || "study";
    state.order = []; state.idx = 0;
    state.selections = new Map(raw?.selections || []);
    state.finalized = new Map(raw?.finalized || []);
    state.pending = new Set(raw?.pending || []);
    if(state.pending.size === 0){ alert("No hay pendientes."); show(els.toolbar); hide(els.pills); return; }
    buildOrder({onlyPending:true});
    hide(els.results); hide(els.intro); show(els.quiz);
    renderQuestion();
  });
}

// ===== Eventos =====
els.startBtn.addEventListener("click", startFresh);
els.continueBtn.addEventListener("click", continueSaved);
els.pendingOnlyBtn.addEventListener("click", startPending);
els.resetBtn.addEventListener("click", ()=>{ clearProgress(); location.reload(); });

els.prevBtn.addEventListener("click", prev);
els.nextBtn.addEventListener("click", next);
els.markPendingBtn.addEventListener("click", markPending);

els.restartBtn.addEventListener("click", ()=>{ hide(els.results); show(els.toolbar); hide(els.pills); show(els.intro); });
$("startPendingFromResults").addEventListener("click", startPending);

// ===== Init =====
window.addEventListener("DOMContentLoaded", async ()=>{
  ensureName();
  await detectModules();

  const saved = loadProgress();
  if(saved){
    els.continueBtn.classList.remove("hidden");
    if((saved.pending||[]).length){ els.pendingOnlyBtn.classList.remove("hidden"); }
  }
});
