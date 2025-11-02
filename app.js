// =================== Estado ===================
let state = {
  name: "",
  mode: "study",
  modules: [], // [{ id:'Modulo01', units:['Modulo01/unidad_01.json', ...] }]
  questions: [],
  idx: 0,
  score: 0,
  answers: [] // [{selected, correct, ok}]
};

// =================== Elementos ===================
const els = {
  askName: document.getElementById("askName"),
  nameInput: document.getElementById("nameInput"),
  saveNameBtn: document.getElementById("saveNameBtn"),

  intro: document.getElementById("intro"),
  loader: document.getElementById("loader"),
  quiz: document.getElementById("quiz"),
  results: document.getElementById("results"),

  moduloSelect: document.getElementById("moduloSelect"),
  mode: document.getElementById("mode"),

  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  checkBtn: document.getElementById("checkBtn"),
  nextBtn: document.getElementById("nextBtn"),
  restartBtn: document.getElementById("restartBtn"),

  qText: document.getElementById("q-text"),
  options: document.getElementById("options"),
  feedback: document.getElementById("feedback"),
  progress: document.getElementById("progress"),
  score: document.getElementById("score"),
  finalScore: document.getElementById("finalScore"),
  reviewList: document.getElementById("reviewList"),
};

// =================== Utils ===================
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

function humanModulo(id){
  // "Modulo03" -> "Módulo 03"
  return "Módulo " + id.replace(/Modulo/i, "");
}

// =================== Nombre ===================
function ensureName(){
  const saved = localStorage.getItem("quizName") || "";
  if(saved.trim()){
    state.name = saved.trim();
    hide(els.askName);
    return true;
  }
  show(els.askName);
  return false;
}

els.saveNameBtn?.addEventListener("click", ()=>{
  const v = (els.nameInput.value || "").trim();
  if(!v){ alert("Por favor, escribe tu nombre."); return; }
  state.name = v;
  localStorage.setItem("quizName", v);
  hide(els.askName);
  alert(`¡Hola, ${state.name}! Selecciona un módulo y pulsa Comenzar.`);
});

// =================== Detección de módulos y unidades ===================
async function detectModules(maxModules=30, maxUnits=60){
  const found = [];

  for(let m=1; m<=maxModules; m++){
    const modId = `Modulo${String(m).padStart(2,"0")}`;
    const unitUrls = [];

    for(let u=1; u<=maxUnits; u++){
      const num = String(u).padStart(2,"0");
      const url = `${modId}/unidad_${num}.json?_=${Date.now()}`;
      try{
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if(res.ok){
          // Confirmamos que es JSON válido
          await res.clone().json().catch(()=>{ throw new Error("Invalid JSON"); });
          unitUrls.push(`${modId}/unidad_${num}.json`);
        }
      }catch(_e){ /* ignorar ausentes */ }
    }

    if(unitUrls.length){
      found.push({ id: modId, units: unitUrls });
    }
  }

  state.modules = found;
  els.moduloSelect.innerHTML = "";

  if(found.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No se encontraron módulos";
    els.moduloSelect.appendChild(opt);
  }else{
    for(const mod of found){
      const opt = document.createElement("option");
      opt.value = mod.id;
      opt.textContent = `${humanModulo(mod.id)} (${mod.units.length} unidades)`;
      els.moduloSelect.appendChild(opt);
    }
  }
}

// =================== Carga y flujo ===================
async function loadModuleQuestions(modId){
  const mod = state.modules.find(m => m.id === modId);
  if(!mod){ throw new Error("Módulo no encontrado"); }

  const all = [];
  for(const url of mod.units){
    try{
      const res = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
      if(!res.ok) continue;
      const data = await res.json();
      const preguntas = data?.preguntas || data || [];
      for(const q of preguntas){
        // Normalizamos por si vinieran pequeñas variaciones de clave
        all.push({
          pregunta: q.pregunta || q.texto || "",
          opciones: q.opciones || q.options || {},
          respuesta_correcta: (q.respuesta_correcta || q.correcta || "").toString()
        });
      }
    }catch(_e){ /* ignorar JSON corrupto en una unidad */ }
  }
  return all;
}

function renderQuestion(){
  const q = state.questions[state.idx];
  if(!q) return;

  els.progress.textContent = `Pregunta ${state.idx+1} / ${state.questions.length}`;
  els.score.textContent = `Aciertos: ${state.score}`;
  els.qText.textContent = q.pregunta || "Pregunta sin texto";
  els.options.innerHTML = "";

  const opciones = q.opciones || {};
  for(const [key,val] of Object.entries(opciones)){
    const id = `opt_${key}`;
    const label = document.createElement("label");
    label.className = "option";
    label.htmlFor = id;
    label.innerHTML = `<input type="radio" name="opt" id="${id}" value="${key}"> <div><strong>${key.toUpperCase()}.</strong> ${val}</div>`;
    els.options.appendChild(label);
  }

  els.feedback.textContent = "";
  els.checkBtn.disabled = false;
  els.nextBtn.disabled = true;
}

function selectedOption(){
  const inp = els.options.querySelector('input[name="opt"]:checked');
  return inp ? inp.value : null;
}

function checkAnswer(){
  const q = state.questions[state.idx];
  const sel = selectedOption();
  if(!sel){ alert("Selecciona una opción."); return; }

  const correct = (q.respuesta_correcta || "").toLowerCase().trim();
  const ok = sel.toLowerCase().trim() === correct;

  if(ok){ state.score++; els.feedback.textContent = "✅ ¡Correcto!"; }
  else  { els.feedback.textContent = `❌ Incorrecto. Respuesta correcta: ${correct.toUpperCase()}`; }

  state.answers.push({ selected: sel, correct, ok });

  for(const lab of els.options.querySelectorAll(".option")){
    const v = lab.querySelector("input").value;
    if(v.toLowerCase() === correct) lab.classList.add("correct");
    else if(v === sel)              lab.classList.add("incorrect");
  }

  els.checkBtn.disabled = true;
  els.nextBtn.disabled = false;
}

function nextQuestion(){
  state.idx++;
  if(state.idx >= state.questions.length) showResults();
  else renderQuestion();
}

function showResults(){
  hide(els.quiz);
  show(els.results);

  const name = state.name ? `, ${state.name}` : "";
  els.finalScore.textContent = `Puntuación${name}: ${state.score} / ${state.questions.length}`;

  els.reviewList.innerHTML = "";
  state.questions.forEach((q, i)=>{
    const a = state.answers[i];
    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>${q.pregunta}</strong></div>
      <div>Tu respuesta: <code>${(a?.selected||'?').toUpperCase()}</code> · Correcta: <code>${(a?.correct||'?').toUpperCase()}</code> ${a?.ok?'✅':'❌'}</div>
    `;
    els.reviewList.appendChild(li);
  });
}

function resetAll(){
  localStorage.removeItem("quizState");
  // Conservamos nombre
  location.reload();
}

async function startQuiz(){
  if(!ensureName()){
    alert("Primero escribe tu nombre y pulsa Guardar.");
    return;
  }

  const modId = els.moduloSelect.value;
  if(!modId){ alert("Selecciona un módulo."); return; }

  state.mode = els.mode.value;
  state.idx = 0;
  state.score = 0;
  state.answers = [];
  state.questions = [];

  hide(els.results);
  hide(els.intro);
  show(els.loader);
  show(els.quiz);

  try{
    const all = await loadModuleQuestions(modId);
    if(all.length === 0) throw new Error("No hay preguntas en este módulo.");
    state.questions = (state.mode === "quiz") ? shuffle(all) : all;
    renderQuestion();
  }catch(e){
    hide(els.quiz);
    alert("Error cargando preguntas: " + e.message);
    show(els.intro);
  }finally{
    hide(els.loader);
  }
}

// =================== Eventos ===================
els.startBtn.addEventListener("click", startQuiz);
els.resetBtn.addEventListener("click", resetAll);
els.checkBtn.addEventListener("click", (ev)=>{ ev.preventDefault(); checkAnswer(); });
els.nextBtn.addEventListener("click", (ev)=>{ ev.preventDefault(); nextQuestion(); });
els.restartBtn.addEventListener("click", ()=>{ hide(els.results); show(els.intro); });

// Guardado ligero (sin banco de preguntas)
window.addEventListener("beforeunload", ()=>{
  const payload = { ...state, questions: [] };
  localStorage.setItem("quizState", JSON.stringify(payload));
});

// =================== Init ===================
window.addEventListener("DOMContentLoaded", async ()=>{
  ensureName();
  await detectModules(30, 60); // busca Modulo01..Modulo30 y unidades 01..60
});
