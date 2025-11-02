let questions = [];
let currentQuestion = 0;
let score = 0;
let mode = "study";

async function loadQuestions(unidad = "Unidad01", numero = "01") {
  const ruta = `${unidad}/unidad_${numero}.json`;
  try {
    const response = await fetch(ruta);
    if (!response.ok) throw new Error(`No se encontró ${ruta}`);
    const data = await response.json();
    return data.preguntas;
  } catch (err) {
    alert(`Error cargando preguntas: ${err.message}`);
    console.error(err);
    return [];
  }
}

function showQuestion() {
  const q = questions[currentQuestion];
  if (!q) return;

  document.getElementById("questionCount").textContent = `Pregunta ${currentQuestion + 1} / ${questions.length}`;
  document.getElementById("questionText").textContent = q.pregunta;

  const optionsDiv = document.getElementById("options");
  optionsDiv.innerHTML = "";

  for (const [key, value] of Object.entries(q.opciones)) {
    const btn = document.createElement("button");
    btn.textContent = `${key.toUpperCase()}: ${value}`;
    btn.classList.add("option-btn");
    btn.onclick = () => selectOption(key);
    optionsDiv.appendChild(btn);
  }

  document.getElementById("checkBtn").disabled = false;
}

let selectedOption = null;
function selectOption(key) {
  selectedOption = key;
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.classList.remove("selected");
    if (btn.textContent.startsWith(key.toUpperCase())) btn.classList.add("selected");
  });
}

function checkAnswer() {
  if (!selectedOption) return alert("Selecciona una respuesta.");

  const correct = questions[currentQuestion].respuesta_correcta;

  const optionButtons = document.querySelectorAll(".option-btn");
  optionButtons.forEach(btn => {
    const key = btn.textContent.charAt(0).toLowerCase();
    btn.classList.remove("correct", "incorrect");
    if (key === correct) btn.classList.add("correct");
    if (key === selectedOption && key !== correct) btn.classList.add("incorrect");
  });

  if (selectedOption === correct) score++;
  document.getElementById("score").textContent = score;

  if (mode === "quiz") document.getElementById("checkBtn").disabled = true;
}

function nextQuestion() {
  currentQuestion++;
  if (currentQuestion >= questions.length) {
    showResults();
  } else {
    selectedOption = null;
    showQuestion();
  }
}

function showResults() {
  document.getElementById("quizContainer").classList.add("hidden");
  document.getElementById("results").classList.remove("hidden");
  document.getElementById("finalScore").textContent = `Has acertado ${score} de ${questions.length} preguntas.`;
}

function resetQuiz() {
  location.reload();
}

async function startQuiz() {
  const unidad = document.getElementById("unidadSelector").value;
  const numero = document.getElementById("archivoSelector").value;
  mode = document.getElementById("mode").value;

  questions = await loadQuestions(unidad, numero);
  if (!questions.length) return;

  currentQuestion = 0;
  score = 0;
  selectedOption = null;

  document.getElementById("results").classList.add("hidden");
  document.getElementById("quizContainer").classList.remove("hidden");
  document.getElementById("score").textContent = "0";

  showQuestion();
}

// EVENTOS
document.getElementById("startBtn").addEventListener("click", startQuiz);
document.getElementById("resetBtn").addEventListener("click", resetQuiz);
document.getElementById("checkBtn").addEventListener("click", checkAnswer);
document.getElementById("nextBtn").addEventListener("click", nextQuestion);
document.getElementById("restartBtn").addEventListener("click", resetQuiz);
