// Quiz simple en JS que carga questions.json
let state = {
  questions: [],
  idx: 0,
  score: 0,
  mode: 'study',
  answers: [] // {selected, correct}
};

const els = {
  intro: document.getElementById('intro'),
  loader: document.getElementById('loader'),
  quiz: document.getElementById('quiz'),
  results: document.getElementById('results'),
  qText: document.getElementById('q-text'),
  options: document.getElementById('options'),
  feedback: document.getElementById('feedback'),
  progress: document.getElementById('progress'),
  score: document.getElementById('score'),
  finalScore: document.getElementById('finalScore'),
  reviewList: document.getElementById('reviewList'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  checkBtn: document.getElementById('checkBtn'),
  nextBtn: document.getElementById('nextBtn'),
  restartBtn: document.getElementById('restartBtn'),
  mode: document.getElementById('mode'),
};

async function loadQuestions() {
  els.loader.classList.remove('hidden');
  try {
    const unidadSeleccionada = document.getElementById("unidadSelect").value;
    const res = await fetch(`preguntas/${unidadSeleccionada}.json?_=${Date.now()}`);
    if (!res.ok) throw new Error('No se pudo cargar questions.json');
    const data = await res.json();
    // Puede venir como { unidad, preguntas: [...] }
    state.questions = data.preguntas || data || [];
  } catch (e) {
    alert('Error cargando preguntas: ' + e.message);
    state.questions = [];
  } finally {
    els.loader.classList.add('hidden');
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startQuiz() {
  state.mode = els.mode.value;
  state.idx = 0;
  state.score = 0;
  state.answers = [];
  if (state.mode === 'quiz') shuffle(state.questions);
  els.intro.classList.add('hidden');
  els.results.classList.add('hidden');
  els.quiz.classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.idx];
  if (!q) return;
  els.progress.textContent = `Pregunta ${state.idx + 1} / ${state.questions.length}`;
  els.score.textContent = `Aciertos: ${state.score}`;
  els.qText.textContent = q.pregunta || q.texto || 'Pregunta sin texto';
  els.options.innerHTML = '';

  const opciones = q.opciones || q.options || {};
  const entries = Object.entries(opciones); // [['a','...'],['b','...'], ...]
  for (const [key, value] of entries) {
    const id = `opt_${key}`;
    const label = document.createElement('label');
    label.className = 'option';
    label.htmlFor = id;
    label.innerHTML = `<input type="radio" name="opt" id="${id}" value="${key}"> <div><strong>${key.toUpperCase()}.</strong> ${value}</div>`;
    els.options.appendChild(label);
  }
  els.feedback.textContent = '';
  els.checkBtn.disabled = false;
  els.nextBtn.disabled = true;
}

function getSelected() {
  const checked = els.options.querySelector('input[name="opt"]:checked');
  return checked ? checked.value : null;
}

function checkAnswer() {
  const q = state.questions[state.idx];
  const selected = getSelected();
  if (!selected) {
    alert('Selecciona una opción.');
    return;
  }
  const correct = (q.respuesta_correcta || q.correcta || '').toLowerCase().trim();
  const ok = selected.toLowerCase().trim() === correct;
  if (ok) {
    state.score += 1;
    els.feedback.textContent = '✅ ¡Correcto!';
  } else {
    els.feedback.textContent = `❌ Incorrecto. Respuesta correcta: ${correct.toUpperCase()}`;
  }
  state.answers.push({selected, correct, ok});

  // Pintar estilos
  for (const label of els.options.querySelectorAll('.option')) {
    const inp = label.querySelector('input');
    const key = inp.value;
    if (key.toLowerCase() === correct) {
      label.classList.add('correct');
    } else if (key === selected) {
      label.classList.add('incorrect');
    }
  }

  els.checkBtn.disabled = true;
  els.nextBtn.disabled = false;

  if (state.mode === 'study') {
    // En estudio mostramos inmediatamente; en quiz se muestra solo feedback breve.
  }
}

function nextQuestion() {
  state.idx += 1;
  if (state.idx >= state.questions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

function showResults() {
  els.quiz.classList.add('hidden');
  els.results.classList.remove('hidden');
  els.finalScore.textContent = `Puntuación: ${state.score} / ${state.questions.length}`;
  els.reviewList.innerHTML = '';
  state.questions.forEach((q, i) => {
    const li = document.createElement('li');
    const a = state.answers[i];
    li.innerHTML = `
      <div><strong>${q.pregunta || q.texto}</strong></div>
      <div>Tu respuesta: <code>${(a?.selected || '?').toUpperCase()}</code> · Correcta: <code>${(a?.correct || '?').toUpperCase()}</code> ${a?.ok ? '✅' : '❌'}</div>
    `;
    els.reviewList.appendChild(li);
  });
}

function resetProgress() {
  localStorage.removeItem('quizState');
  location.reload();
}

// Wire-up
els.startBtn.addEventListener('click', startQuiz);
els.resetBtn.addEventListener('click', resetProgress);
els.checkBtn.addEventListener('click', checkAnswer);
els.nextBtn.addEventListener('click', nextQuestion);
els.restartBtn.addEventListener('click', () => { els.intro.classList.remove('hidden'); els.results.classList.add('hidden'); });

// Intentar guardar/recuperar (simple)
window.addEventListener('beforeunload', () => {
  const payload = {...state};
  localStorage.setItem('quizState', JSON.stringify(payload));
});

window.addEventListener('DOMContentLoaded', async () => {
  await loadQuestions();
});
