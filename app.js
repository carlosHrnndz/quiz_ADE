// -------- Config editable --------
const MODULE_MIN = 1, MODULE_MAX = 20;   // Modulo01..Modulo20
const UNIT_MIN   = 1, UNIT_MAX   = 40;   // unidad_01..unidad_40
const PARALLEL_UNIT_FETCH = 8;           // nº de peticiones simultáneas por módulo

// -------- Estado --------
let state = {
  name: "",
  mode: "study",
  modules: [],           // [{id:'Modulo01', units:['Modulo01/unidad_01.json', ...]}]
  questions: [],
  idx: 0,
  score: 0,
  answers: []
};

// -------- Elementos --------
const $ = id => document.getElementById(id);
const els = {
  askName: $("askName"), nameInput: $("nameInput"), saveNameBtn: $("saveNameBtn"),
  intro: $("intro"), loader: $("loader"), quiz: $("quiz"), results: $("results"),
  moduloSelect: $("moduloSelect"), mode: $("mode"),
  startBtn: $("startBtn"), resetBtn: $("resetBtn"),
  checkBtn: $("checkBtn"), nextBtn: $("nextBtn"), restartBtn: $("restartBtn"),
  qText: $("q-text"), options: $("options"), feedback: $("feedback"),
  progress: $("progress"), score: $("score"), finalScore: $("finalScore"), reviewList: $("reviewList"),
  detectWrap: $("detectWrap"), detectBar: $("detectBar"), detectMsg: $("detectMsg")
};
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

// -------- Util --------
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
const sleep = ms => new Promise(r=>setTimeout(r, ms));

// -------- Nombre --------
function ensureName(){
  const saved = localStorage.getItem("quizName") || "";
  if(saved.trim()){ state.name = saved.trim(); hide(els.askName); return true; }
  show(els.askName); return false;
}
els.saveNameBtn.addEventListener("click", ()=>{
  const v = (els.nameInput.value||"").trim();
  if(!v) return alert("Escribe tu nombre.");
  state.name = v; localStorage.setItem("quizName", v); hide(els.askName);
  alert(`¡Hola, ${state.name}! Elige un módulo y pulsa Comenzar.`);
});

// -------- Detección de módulos/unidades (rápida + progreso) --------
async function headOrGetJSON(url){
  // GET directo (HEAD no siempre habilitado en Pages). Devuelve true si 200 y JSON válido.
  try{
    const r = await fetch(url + `?_=${Date.now()}`, {cache:"no-store"});
    if(!r.ok) return false;
    await r.clone().json().catch(()=>{ throw 0; });
    return true;
  }catch{ return false; }
}

async function detectModules(){
  const totalChecks = (MODULE_MAX-MODULE_MIN+1) * (UNIT_MAX-UNIT_MIN+1);
  let done = 0;
  const update = () => {
    const pct = Math.round((done/totalChecks)*100);
    els.detectBar.style.width = pct + "%";
    els.detectMsg.textContent = `Detectando módulos y unidades… ${pct}%`;
  };
  update();

  const found = await Promise.all(
    Array.from({length: MODULE_MAX - MODULE_MIN + 1}, (_,i)=> MODULE_MIN+i)
      .map(async m => {
        const modId = `Modulo${String(m).padStart(2,"0")}`;
        const unitNumbers = Array.from({length: UNIT_MAX - UNIT_MIN + 1}, (_,k)=> UNIT_MIN+k);
        const units = [];

        // Lotes en paralelo (para no saturar)
        for(let start=0; start<unitNumbers.length; start+=PARALLEL_UNIT_FETCH){
          const batch = unitNumbers.slice(start, start+PARALLEL_UNIT_FETCH);
          const results = await Promise.all(batch.map(async u=>{
            const num = String(u).padStart(2,"0");
            const url = `${modId}/unidad_${num}.json`;
            const ok = await headOrGetJSON(url);
            done++; update();
            return ok ? url : null;
          }));
          results.forEach(u=>{ if(u) units.push(u); });
          // Pequeño respiro para UI
          await sleep(20);
        }
        return units.length ? { id: modId, units } : null;
      })
  );

  state.modules = found.filter(Boolean);
  els.moduloSelect.innerHTML = "";
  if(state.modules.length === 0){
    els.moduloSelect.innerHTML = `<option value="">No se encontraron módulos</option>`;
  }else{
    state.modules.forEach(m=>{
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.id} (${m.units.length} unidades)`;
      els.moduloSelect.appendChild(opt);
    });
  }
  // ocultar barra
  els.detectBar.style.width = "100%";
  els.detectMsg.textContent = state.modules.length
    ? "Detección completada."
    : "No se encontraron módulos/unidades en las rutas esperadas.";
  setTimeout(()=>{ els.detectWrap.style.display = "none"; els.detectMsg.textContent=""; }, 800);
}

// -------- Carga y flujo --------
async function loadModuleQuestions(modId){
  const mod = state.modules.find(m=>m.id===modId);
  if(!mod) throw new Error("Módulo no encontrado.");
  const all = [];
  for(const url of mod.units){
    try{
      const r = await fetch(url+`?_=${Date.now()}`, {cache:"no-store"});
      if(!r.ok) continue;
      const data = await r.json();
      const preguntas = data?.preguntas || data || [];
      preguntas.forEach(q=>{
        all.push({
          pregunta: q.pregunta || q.texto || "",
          opciones: q.opciones || q.options || {},
          respuesta_correcta: (q.respuesta_correcta || q.correcta || "").toString()
        });
      });
    }catch{}
  }
  return all;
}

function renderQuestion(){
  const q = state.questions[state.idx];
  els.progress.textContent = `Pregunta ${state.idx+1} / ${state.questions.length}`;
  els.score.textContent = `Aciertos: ${state.score}`;
  els.qText.textContent = q?.pregunta || "Pregunta sin texto";
  els.options.innerHTML = "";
  Object.entries(q?.opciones||{}).forEach(([k,v])=>{
    const id=`opt_${k}`;
    const label=document.createElement("label");
    label.className="option"; label.htmlFor=id;
    label.innerHTML=`<input type="radio" name="opt" id="${id}" value="${k}"> <div><strong>${k.toUpperCase()}.</strong> ${v}</div>`;
    els.options.appendChild(label);
  });
  els.feedback.textContent=""; els.checkBtn.disabled=false; els.nextBtn.disabled=true;
}
function selected(){ const x = els.options.querySelector('input[name="opt"]:checked'); return x?x.value:null; }
function checkAnswer(){
  const q = state.questions[state.idx]; const sel = selected();
  if(!sel) return alert("Selecciona una opción.");
  const correct = (q.respuesta_correcta||"").toLowerCase().trim();
  const ok = sel.toLowerCase().trim()===correct;
  if(ok){ state.score++; els.feedback.textContent="✅ ¡Correcto!"; }
  else  { els.feedback.textContent=`❌ Incorrecto. Respuesta correcta: ${correct.toUpperCase()}`; }
  state.answers.push({selected:sel, correct, ok});
  els.options.querySelectorAll(".option").forEach(l=>{
    const val = l.querySelector("input").value;
    if(val.toLowerCase()===correct) l.classList.add("correct");
    else if(val===sel) l.classList.add("incorrect");
  });
  els.checkBtn.disabled=true; els.nextBtn.disabled=false;
}
function nextQuestion(){ state.idx++; (state.idx>=state.questions.length)?showResults():renderQuestion(); }
function showResults(){
  hide(els.quiz); show(els.results);
  const name = state.name?`, ${state.name}`:"";
  els.finalScore.textContent = `Puntuación${name}: ${state.score} / ${state.questions.length}`;
  els.reviewList.innerHTML = "";
  state.questions.forEach((q,i)=>{
    const a = state.answers[i];
    const li = document.createElement("li");
    li.innerHTML = `<div><strong>${q.pregunta}</strong></div>
      <div>Tu respuesta: <code>${(a?.selected||'?').toUpperCase()}</code> · Correcta: <code>${(a?.correct||'?').toUpperCase()}</code> ${a?.ok?'✅':'❌'}</div>`;
    els.reviewList.appendChild(li);
  });
}
function resetAll(){ localStorage.removeItem("quizState"); location.reload(); }

async function startQuiz(){
  if(!ensureName()) return alert("Escribe tu nombre y pulsa Guardar.");
  const modId = els.moduloSelect.value;
  if(!modId) return alert("Selecciona un módulo.");
  state.mode = els.mode.value; state.idx=0; state.score=0; state.answers=[]; state.questions=[];
  hide(els.results); hide(els.intro); show(els.loader); show(els.quiz);
  try{
    const all = await loadModuleQuestions(modId);
    if(!all.length) throw new Error("No hay preguntas en este módulo.");
    state.questions = (state.mode==="quiz") ? shuffle(all) : all;
    renderQuestion();
  }catch(e){
    hide(els.quiz); alert("Error cargando preguntas: "+e.message); show(els.intro);
  }finally{ hide(els.loader); }
}

// -------- Eventos --------
els.startBtn.addEventListener("click", startQuiz);
els.resetBtn.addEventListener("click", resetAll);
els.checkBtn.addEventListener("click", e=>{e.preventDefault(); checkAnswer();});
els.nextBtn.addEventListener("click", e=>{e.preventDefault(); nextQuestion();});
els.restartBtn.addEventListener("click", ()=>{ hide(els.results); show(els.intro); });

// -------- Init --------
window.addEventListener("DOMContentLoaded", async ()=>{
  ensureName();
  await detectModules(); // ahora con paralelismo + barra de progreso
});
