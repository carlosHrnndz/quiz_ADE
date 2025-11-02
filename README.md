# Quiz Web (Estático · GitHub Pages)

Este proyecto convierte tu script local de estudio/examen en una versión **100% web** que puedes alojar gratis en **GitHub Pages**.

## Estructura
```
.
├─ index.html      # Interfaz del quiz
├─ styles.css      # Estilos (tema oscuro)
├─ app.js          # Lógica del quiz (JS)
└─ questions.json  # Banco de preguntas
```

El formato de `questions.json` admite esta estructura (como la que usabas):
```json
{
  "unidad": 8,
  "preguntas": [
    {
      "numero": 1,
      "pregunta": "Texto…",
      "opciones": {
        "a": "Opción A",
        "b": "Opción B",
        "c": "Opción C",
        "d": "Opción D"
      },
      "respuesta_correcta": "b"
    }
  ]
}
```

## Pasos para publicarlo en GitHub Pages

1. **Crea un repositorio** nuevo en GitHub (ej. `quiz-rrhh`). Sin plantillas.
2. En tu ordenador, coloca estos 4 archivos en una carpeta vacía.
3. Abre una terminal en esa carpeta y ejecuta:
   ```bash
   git init
   git add .
   git commit -m "Quiz web inicial"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/quiz-rrhh.git
   git push -u origin main
   ```
4. En GitHub, ve a **Settings → Pages**:
   - **Build and deployment**: Source = `Deploy from a branch`
   - **Branch**: `main` y carpeta `/ (root)`
   - Guarda. En 1–2 minutos tendrás una URL del estilo: `https://tu-usuario.github.io/quiz-rrhh/`
5. Abre la URL y **prueba el quiz**.

## Cómo subir tus propias preguntas
- Edita `questions.json` respetando el formato. Puedes tener miles de preguntas.
- Si quieras **dividir por unidades**, crea varios JSON (ej. `u01.json`, `u02.json`) y cambia en `app.js` la línea de `fetch('questions.json')` por el archivo que corresponda, o bien añade un selector en la UI para elegir la unidad.

## Opcional: mantenerlo en Python (sin reescribir a JS)
Si prefieres seguir en Python:
- **Streamlit Cloud** (fácil, requiere cuenta): conviertes tu script a Streamlit y lo despliegas desde GitHub.
- **PyScript/Pyodide** (100% estático): puedes ejecutar Python en el navegador, pero es más pesado que la versión JS.

## Consejos
- Para **privacidad**, mantén el repo en privado y usa GitHub Pages con visibilidad pública solo si te da igual que cualquiera lo vea.
- Activa **GitHub Discussions/Issues** si lo usarán más personas y quieres feedback.
- Usa una rama `develop` para preparar cambios y `main` como rama de producción.
