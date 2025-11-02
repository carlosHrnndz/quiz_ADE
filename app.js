// ===== Config =====
const MODULE_MIN = 1, MODULE_MAX = 30;   // Modulo01..Modulo30
const UNIT_MIN   = 1, UNIT_MAX   = 60;   // unidad_01..unidad_60

// ===== Estado =====
let state = {
  name: "",
  moduleId: null,
  mode: "study", // 'study' | 'exam'
  questions: [],       // [{texto, opciones, correcta, gid}]
  order: [],           // índices del banco actual (para 'solo pendientes' o random en examen)
  idx: 0,
  score: 0,
  answers: [],         // [{gid, selected, correct, ok}]
  pending: new Set(),  // set de gid
  hasSaved: false
};

// ===== Helpers DOM =====
const $ = id => document.getElementById(id);
const els = {
  askName: $("askName"), nameInput: $("nameInput"), saveNameBtn: $("saveNameBtn"),
  intro: $("intro"), loader: $("loader"), quiz: $("quiz"), results: $("results"),
  moduloSelect: $("moduloSelect"), mode: $("mode"),
  startBtn: $("startBtn"), continueBtn: $("continueBtn"), pendingOnlyBtn: $("pendingOnlyBtn"),
  resetBtn: $("resetBtn"), clearPendBtn: $("clearPendBtn"),
  markPendingBtn: $("markPendingBtn"), skipBtn: $("skipBtn"),
  restartBtn: $("restartBtn"), startPendingFromResults: $("startPendingFromResults"),
  qText: $("q-text"), options: $("options"), feedback: $("feedback"),
  progress: $("progress"), score: $("score"), pendingCount: $("pendingCount"),
  finalScore: $("finalScore"), reviewList: $("reviewList"),
  detectMsg: $("detectMsg"), pillModulo: $("pillModulo"), pillStats: $("pillStats")
};
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

// ===== Util =====
function pad2(n){ return String(n).padStart(2,"0"); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function gidOf(modId, unitNum, qIdx){ return `${modId}|${pad2(unitNum)}|${qIdx}`; }

// ===== Persistencia =====
const KEY = "quiz_rrhh_state_v2";
function saveProgress(){
  const payload = {
    name: state.name,
    moduleId: state.moduleId,
    mode: state.mode,
    idx: state.idx,
    score: state.score,
    answers: state.answers,
    pending: Array.from(state.pending),
    order: state.order
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  state.hasSaved = true;
}
function loadProgress(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}
function clearProgress(){ localStorage.removeItem(KEY); }

// ===== Nombre =====
function ensureName(){
  const raw = loadProgress();
  if(raw?.name){ state.name = raw.name; hide(els.askName); return true; }
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

// ===== Detección de módulos/unidades =====
async function existsJson(url){
  try{
    const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"});
    if(!r.ok) return false; await r.clone().json(); return true;
  }catch{ return false; }
}
async function detectModules(){
  els.moduloSelect.innerHTML = `<option value="">Detectando…</option>`;
  const found = [];
  for(let m=MODULE_MIN; m<=MODULE_MAX; m++){
    const modId = `Modulo${pad2(m)}`;
    // probamos una unidad rápida para decidir si existe el módulo
    const quick = await existsJson(`${modId}/unidad_${pad2(1)}.json`);
    if(!quick){
      // quizá no tenga unidad_01 pero sí otras; probamos 02–05
      let any=false;
      for(let k=2;k<=5;k++){ if(await existsJson(`${modId}/unidad_${pad2(k)}.json`)){ any=true; break; } }
      if(!any) continue;
    }
    found.push(modId);
  }
  if(!found.length){
    els.moduloSelect.innerHTML = `<option value="">No se encontraron módulos</option>`;
    els.detectMsg.textContent = "No hay ModuloXX con unidad_YY.json accesibles.";
    return;
  }
  els.moduloSelect.innerHTML = found.map(m=>`<option value="${m}">${m}</option>`).join("");
  els.detectMsg.textContent = `Detectados: ${found.join(", ")}`;
}

// ===== Carga del banco de preguntas =====
async function loadModuleQuestions(modId){
  const all = [];
  for(let u=UNIT_MIN; u<=UNIT_MAX; u++){
    const url = `${modId}/unidad_${pad2(u)}.json`;
    try{
      const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"});
      if(!r.ok) continue;
      const data = await r.json();
      const preguntas = data?.preguntas || data || [];
      preguntas.forEach((q, i)=>{
        all.push({
          texto: q.pregunta || q.texto || "",
          opciones: q.opciones || q.options || {},
          correcta: (q.respuesta_correcta || q.correcta || "").toString().trim().toLowerCase(),
          gid: gidOf(modId, u, i)
        });
      });
    }catch{/* ignora unidad inexistente */}
  }
  return all;
}

// ===== Construcción del orden de pase =====
function buildOrder({onlyPending=false}={}){
  const baseIdxs = state.questions.map((_,i)=>i);
  let idxs = baseIdxs;
  if(onlyPending){
    const pendingIdxs = baseIdxs.filter(i => state.pending.has(state.questions[i].gid));
    idxs = pendingIdxs;
  }
  // examen mezcla, estudio respeta orden
  if(state.mode === "exam") shuffle(idxs);
  state.order = idxs;
  state.idx = 0;
  state.score = 0;
  state.answers = [];
  updatePills();
}

// ===== Render y flujo =====
function updatePills(){
  const total = state.questions.length;
  const answered = state.answers.length;
  const pend = state.pending.size;
  els.pillModulo.textContent = `Módulo: ${state.moduleId ?? "—"}`;
  els.pillStats.textContent  = `${answered} respondidas · ${pend} pendientes · ${total} totales`;
  els.pendingCount.textContent = `Pendientes: ${pend}`;
}
function renderQuestion(){
  if(state.order.length === 0){ showResults(); return; }
  const qIndex = state.order[state.idx];
  const q = state.questions[qIndex];

  els.progress.textContent = `Pregunta ${state.idx+1} / ${state.order.length}`;
  els.score.textContent = `Aciertos: ${state.score}`;
  els.qText.textContent = q.texto || "Pregunta sin texto";
  els.options.innerHTML = "";

  Object.entries(q.opciones).forEach(([k,v])=>{
    const id = `opt_${k}`;
    const lab = document.createElement("label");
    lab.className = "option"; lab.htmlFor = id;
    lab.innerHTML = `<input type="radio" name="opt" id="${id}" value="${k}"> <div><strong>${k.toUpperCase()}.</strong> ${v}</div>`;
    // Autoadvance al seleccionar
    lab.querySelector("input").addEventListener("change", ()=>onSelectAnswer(q, k));
    els.options.appendChild(lab);
  });

  els.feedback.textContent = "";
  updatePills();
  saveProgress();
}
function nextQuestion(){
  state.idx += 1;
  if(state.idx >= state.order.length){ showResults(); }
  else { renderQuestion(); }
}
function onSelectAnswer(q, selectedKey){
  const sel = (selectedKey||"").toString().trim().toLowerCase();
  const ok  = sel === q.correcta;
  state.answers.push({ gid:q.gid, selected:sel, correct:q.correcta, ok });

  if(ok) state.score += 1;

  // Estilos de feedback
  els.options.querySelectorAll(".option").forEach(l=>{
    const v = l.querySelector("input").value.toString().toLowerCase();
    if(v === q.correcta) l.classList.add("correct");
    else if(v === sel)   l.classList.add("incorrect");
  });

  if(state.mode === "study"){
    els.feedback.textContent = ok ? "✅ ¡Correcto!" : `❌ Incorrecto. Correcta: ${q.correcta.toUpperCase()}`;
    saveProgress();
    setTimeout(nextQuestion, 700);
  }else{
    // examen: no mostramos corrección
    saveProgress();
    setTimeout(nextQuestion, 200);
  }
}

// Marcar pendiente / Omitir
function markPending(){
  const qIndex = state.order[state.idx];
  const q = state.questions[qIndex];
  state.pending.add(q.gid);
  updatePills();
  saveProgress();
}
function skipQuestion(){
  markPending();
  nextQuestion();
}

// Resultados
function showResults(){
  hide(els.quiz); show(els.results);
  const name = state.name ? `, ${state.name}` : "";
  els.finalScore.textContent = `Puntuación${name}: ${state.score} / ${state.order.length}`;
  els.reviewList.innerHTML = "";
  state.answers.forEach(a=>{
    const q = state.questions.find(x=>x.gid===a.gid);
    const li = document.createElement("li");
    li.innerHTML = `<div><strong>${q?.texto||""}</strong></div>
      <div>Tu respuesta: <code>${(a.selected||'?').toUpperCase()}</code> · Correcta: <code>${(a.correct||'?').toUpperCase()}</code> ${a.ok?'✅':'❌'}</div>`;
    els.reviewList.appendChild(li);
  });
  updatePills();
  saveProgress();
}

// ===== Eventos de UI =====
els.startBtn.addEventListener("click", startFresh);
els.continueBtn.addEventListener("click", continueSaved);
els.pendingOnlyBtn.addEventListener("click", startPending);
els.resetBtn.addEventListener("click", ()=>{ clearProgress(); location.reload(); });

els.markPendingBtn.addEventListener("click", ()=>{ markPending(); nextQuestion(); });
els.skipBtn.addEventListener("click", skipQuestion);
els.restartBtn.addEventListener("click", ()=>{ hide(els.results); show(els.intro); });
els.startPendingFromResults.addEventListener("click", startPending);
els.clearPendBtn.addEventListener("click", ()=>{ state.pending.clear(); updatePills(); saveProgress(); });

// ===== Flujos =====
async function startFresh(){
  if(!ensureName()) return alert("Escribe tu nombre y pulsa Guardar.");
  const modId = els.moduloSelect.value; if(!modId) return alert("Selecciona un módulo.");
  state.moduleId = modId;
  state.mode = els.mode.value;

  show(els.loader); hide(els.results); hide(els.intro); show(els.quiz);

  state.questions = await loadModuleQuestions(modId);
  if(!state.questions.length){ hide(els.quiz); show(els.intro); alert("No hay preguntas en este módulo."); return; }

  // no tocamos pendientes previas: persisten entre pases
  buildOrder({onlyPending:false});
  renderQuestion();
}
function continueSaved(){
  const raw = loadProgress(); if(!raw) return;
  Object.assign(state, {
    name: raw.name, moduleId: raw.moduleId, mode: raw.mode,
    idx: raw.idx, score: raw.score, answers: raw.answers || [],
    pending: new Set(raw.pending || []), order: raw.order || []
  });
  hide(els.results); hide(els.intro); show(els.quiz);
  renderQuestion();
}
function startPending(){
  if(!state.moduleId){ // si no hay módulo cargado, intenta desde guardado
    const raw = loadProgress(); if(!raw?.moduleId) return alert("No hay módulo cargado/guardado.");
    state.moduleId = raw.moduleId; state.pending = new Set(raw.pending || []);
    state.mode = els.mode.value || raw.mode || "study";
    show(els.loader);
    loadModuleQuestions(state.moduleId).then(qs=>{
      state.questions = qs;
      buildOrder({onlyPending:true});
      hide(els.results); hide(els.intro); show(els.quiz); renderQuestion();
      hide(els.loader);
    });
    return;
  }
  if(state.pending.size === 0) return alert("No hay pendientes.");
  buildOrder({onlyPending:true});
  hide(els.results); hide(els.intro); show(els.quiz); renderQuestion();
}

// ===== Init =====
window.addEventListener("DOMContentLoaded", async ()=>{
  ensureName();
  await detectModules();

  const saved = loadProgress();
  if(saved){
    els.continueBtn.classList.remove("hidden");
    state.pending = new Set(saved.pending || []);
    state.moduleId = saved.moduleId || null;
    if(state.moduleId) els.pillModulo.textContent = `Módulo: ${state.moduleId}`;
    updatePills();
    els.pendingOnlyBtn.classList.toggle("hidden", state.pending.size===0);
    els.clearPendBtn.classList.toggle("hidden", state.pending.size===0);
  }
});
