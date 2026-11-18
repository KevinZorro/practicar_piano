# Plan de la Fase 1: MVP completo

> **Actualización 2026-11-17:** Kevin respondió la sección 9. Resumen: sin caché en el servidor, 10 min de duración máxima, cola de 1 + 5, máx. 10 notas simultáneas, aviso por notificación del navegador y nombre Teclario. Detalle en los ADR [0016](../adr/0016-entrega-sin-cache-y-limites.md) y [0017](../adr/0017-reduccion-de-polifonia.md); donde este plan hable de caché con TTL de 24 h o de tope de 5 minutos, mandan los ADR. La numeración de ADR previstos se corrió una posición porque 0015 lo ocupa el proxy.

- Fecha: 2026-11-15
- Estado: **Propuesta (revisión 2), pendiente del visto bueno de Kevin.** No se escribe código de la Fase 1 hasta que se apruebe.
- Revisión 2 (2026-11-15): Kevin eligió **ByteDance** como motor tras escuchar los diez covers, quiere procesamiento **asíncrono** (aviso al terminar y resultado en caché) y detectó acordes de más de 15 notas simultáneas en canciones difíciles, imposibles de tocar. Eso añade una **reducción de polifonía** a la partitura y a la práctica. Los cambios están marcados con «(rev. 2)».
- Fuentes de verdad: estudio de viabilidad y registro de decisiones (D-01 a D-12), resumidos en `docs/adr/`.
- Skills aplicadas: `arquitectura-y-datos` (contrato de API, módulos, ADR), `calidad-y-seguridad` (pruebas, CI, límites, privacidad), `desarrollo-senior` (incrementos pequeños, commits convencionales).

## 1. Alcance y punto de partida

**Objetivo.** El usuario pega el enlace de un cover de piano, espera su turno en la cola, y practica con su teclado USB: notas cayendo, partitura sincronizada, modo espera con retroceso, velocidad ajustable y biblioteca con progreso. Sin cuentas.

**Dentro** (tabla del estudio, "Incluido en el MVP"): descarga y transcripción en la VPS, notas cayendo, partitura, Web MIDI, modo espera, velocidad, biblioteca y progreso.
**Fuera**: subida de archivos (salvo que falle la descarga, ver §8), varios instrumentos, corrección de partitura, Android, cuentas, anuncios.

**Estado heredado de la Fase 0** (rama `claude/project-thread-7gi51h`, sin modificar):
- Backend hexagonal con puertos `AudioDownloader`, `Transcriber`, `Synthesizer`, `ResourceMeter`; `VideoUrl` valida enlaces; Basic Pitch (ONNX) y ByteDance como adaptadores; Dockerfile arm64 con Deno y ffmpeg; CI con Ruff, mypy estricto, pytest y gitleaks.
- Compuerta 1 (rev. 2): por oído, **ByteDance es «mucho mejor» que Basic Pitch** y Kevin lo elige. Cuesta factor ≈ 2,0 en la VPS (una canción de 3 minutos tarda ≈ 6 minutos, frente al presupuesto original de 2) y ≈ 1,5 GB de memoria; Basic Pitch hace factor 0,04–0,12 con ≈ 500 MB. Kevin acepta el costo a cambio de procesar de forma asíncrona. El ADR 0006 y el criterio de tiempo de la compuerta los registra el hilo de la Fase 0, no este plan.
- Sigue pendiente que la descarga funcione desde la VPS (YouTube la bloquea; el proxy por WireGuard se prepara aparte).

**Supuesto de este plan (rev. 2):** ByteDance es el motor (ADR 0014, aceptado por Kevin), detrás del puerto `Transcriber`; Basic Pitch queda como adaptador alternativo, sin interfaz propia en el MVP. Lo que cambia si falla la descarga está en §8.

## 2. Arquitectura objetivo

```mermaid
sequenceDiagram
  participant B as Navegador
  participant N as Nginx
  participant A as API FastAPI
  participant W as Worker (subproceso)
  B->>N: POST /api/v1/jobs {url}
  N->>A: valida enlace, duración y límite por IP
  A-->>B: 202 {job_id, estimación}
  Note over B: el navegador guarda job_id en IndexedDB y puede cerrarse
  A->>W: descarga con yt-dlp y transcribe con ByteDance (una canción a la vez)
  W-->>A: notas completas (sin MIDI ni partitura finales)
  B->>A: GET /api/v1/jobs/{id}/events (SSE, o consulta al volver)
  A-->>B: queued(pos, espera) → downloading → transcribing → scoring → done
  Note over B: aviso del navegador al terminar
  B->>A: GET /api/v1/jobs/{id}/result?level=playable
  A-->>B: notas reducidas, MIDI, MusicXML, mapa de tiempos
  Note over A,W: el audio se borra siempre; solo el resultado queda en caché con TTL (rev. 2)
```

### 2.1 Backend (`backend/src/teclario/`)

Se mantiene la regla `cli/api → application → domain`; `infrastructure` implementa los puertos.

| Capa | Nuevo en la Fase 1 |
| --- | --- |
| `domain` | `Job` y su máquina de estados (`queued → downloading → transcribing → scoring → done / failed / expired`), `NoteEvent`, `Transcription`, `Score` (MusicXML + mapa de tiempos), `DurationPolicy`, **`PolyphonyReducer` y `PlayabilityPolicy` (rev. 2)**, errores con código estable |
| `application` | Casos de uso `SubmitJob`, `GetJobStatus`, `FetchResult`, `DeleteResult`; `ProcessJob` (descarga → transcribe → borra audio) y `BuildScore` (reduce → arma partitura, se puede repetir desde la caché sin volver a transcribir); puertos nuevos `JobQueue`, `JobStore`, `ResultCache`, `ScoreBuilder`, `RateLimiter`, `Clock` |
| `infrastructure` | Cola en memoria con un worker; caché de resultados con TTL (ver abajo); `Music21ScoreBuilder`; limitador por IP; adaptadores existentes sin cambios |
| `api` (nueva) | FastAPI: rutas, esquemas Pydantic, SSE, manejo de errores, lectura de IP real tras Nginx, `/healthz` |

Decisiones de diseño que sostienen las reglas de D-07 y de seguridad:
- **Worker en subproceso**, como ya hace el medidor de la Fase 0: un OOM o un fallo de yt-dlp no tumba la API y la memoria vuelve al sistema. Con ByteDance (≈ 1,5 GB, ≈ 2× la duración) el worker carga el modelo una vez y se reinicia cada N canciones para devolver memoria; se limita su CPU (por ejemplo 1,5 de los 2 OCPU) para que Nginx y la API sigan respondiendo mientras transcribe. (rev. 2)
- **Procesamiento asíncrono de verdad (rev. 2).** El trabajo sigue aunque el navegador se cierre. `POST` devuelve `job_id`, un identificador aleatorio de 128 bits que hace de credencial; el navegador lo guarda en IndexedDB, de modo que al volver (misma pestaña u otro día) consulta el estado y recoge el resultado. SSE es solo una comodidad mientras la pestaña está abierta; la consulta simple (`GET /jobs/{id}`) siempre funciona.
- **Aviso al terminar (rev. 2).** En el MVP: API de Notificaciones del navegador (permiso pedido al enviar el enlace), título de la pestaña y sonido, más una marca de «lista» en la biblioteca al volver. Con la pestaña cerrada no hay aviso en el MVP. Web Push (service worker y claves VAPID) queda como mejora: exige un servicio de push de terceros y la librería `pywebpush` es MPL-2.0, que habría que revisar frente a la regla de solo licencias permisivas.
- **Cola con estimación de espera (rev. 2).** Un trabajo tarda ≈ 2× la duración de la canción, así que con 5 canciones de 3 minutos delante la espera pasa de media hora. La cola muestra posición y espera estimada, rechaza con 503 cuando hay más de N trabajos (propuesta: 10) y limita a 2 trabajos activos por IP.
- **Caché de resultados con TTL (rev. 2).** Sustituye al «borrar al entregar». Se guarda solo el resultado (notas completas, MusicXML y mapa de tiempos), nunca el audio ni el enlace, con TTL de 24 horas (propuesta), clave por `job_id` aleatorio (nunca por ID de video, para que nadie reciba la transcripción de otro y no se forme un catálogo común, Ley 23) y borrado explícito con `DELETE`. Es un cambio frente a la redacción de D-07 («no guarda copia de lo que devuelve»): **requiere ADR y tu confirmación** (ver §6). Se propone un archivo en un volumen del compose y no solo memoria, para sobrevivir a reinicios del servicio.
- **La cola es volátil.** Si el servicio reinicia, los trabajos pendientes se pierden (guardarlos exigiría persistir enlaces); el navegador lo detecta con un 404 y ofrece reintentar. Los resultados ya terminados sí sobreviven por la caché.
- **Seguridad** (`calidad-y-seguridad`): enlace validado por `VideoUrl` antes de tocar la red; duración consultada con yt-dlp sin descargar y rechazada si pasa el máximo; tope de trabajos por IP en cola y por hora; tamaño máximo del cuerpo; sin enlaces en logs (filtro de logging con prueba que lo verifica); secretos solo por variables de entorno; Nginx añade `limit_req` y cabeceras de seguridad; CORS cerrado al propio dominio.
- **Contrato**: el esquema OpenAPI se genera desde FastAPI, se versiona en `docs/api/openapi.json` y el frontend genera sus tipos con `openapi-typescript`. CI falla si el archivo queda desactualizado.

**Respuesta del resultado** (propuesta, rev. 2): `{ meta: {duration_s, tempo_bpm, time_signature, tempo_confidence, level, max_polyphony_full, max_polyphony_playable, notes_dropped_ratio}, notes: [{pitch, start_s, end_s, velocity, hand}], midi_b64, musicxml, timemap: [{measure, start_s}] }`. El parámetro `level` (`full`, `playable` por defecto, `easy`) elige cuánta reducción se aplica; se recalcula desde la caché sin volver a transcribir. `full` solo se usa para descargar el MIDI original. El `timemap` es lo que permite mover el cursor de la partitura al ritmo del video sin que el navegador tenga que adivinar compases.

**Reducción de polifonía (rev. 2).** ByteDance transcribe todo lo que suena, y en piezas difíciles salen acordes de 15 o más notas a la vez, imposibles de tocar con dos manos. La reducción es un paso previo a la partitura y a la práctica, una función pura del dominio (`PolyphonyReducer`) con una política configurable (`PlayabilityPolicy`):
1. Agrupa inicios casi simultáneos (ventana de unos 40–60 ms) en un mismo acorde, para no tratar como arpegio lo que fue un golpe.
2. Elimina notas fantasma: duración muy corta y velocidad baja, y duplicados de octava dentro de un acorde cuando sobran notas.
3. Por mano, limita a 5 notas simultáneas (4 en `easy`) y a un alcance máximo (propuesta: décima en `playable`, octava en `easy`).
4. Al recortar, **conserva siempre la nota más aguda (melodía) y la más grave (bajo)** y descarta las internas por menor velocidad y menor duración, para que la canción siga siendo reconocible.
5. Acota el total simultáneo a 10 (8 en `easy`) y marca en `meta` cuánto se descartó, para que la interfaz lo diga.
Propiedades que se prueban: nunca se supera el límite por mano ni el alcance; melodía y bajo sobreviven; no se crean notas nuevas; es idempotente; con polifonía baja no cambia nada. La política se afina con las canciones difíciles de Kevin (fixtures sintéticos con la misma forma, nunca audio protegido). El MIDI y la partitura descargables ofrecen `full` y `playable`.

**Partitura (D-09).** Pulso estimado desde el MIDI (histograma de intervalos entre inicios, con prueba sobre melodías sintéticas de tempo conocido), cuantización a rejilla de semicorcheas o tresillos con tolerancia, manos con la regla del do central (D-08), construcción con music21 y salida MusicXML. Cada paso es una función pura con pruebas de propiedades, y la partitura se arma sobre las notas ya reducidas. Si el tempo no es estable el resultado marca `tempo_confidence: low` y la interfaz avisa que la partitura es aproximada.

### 2.2 Frontend (`frontend/`, React + TypeScript estricto + Vite)

Organización por funciones, con el núcleo en TypeScript puro y sin React para poder probarlo con Vitest:

```
frontend/src/
  core/
    practice/        máquina de estados del modo práctica (playing, waiting, rewinding)
    clock/           PlaybackClock: interfaz única de tiempo con dos implementaciones
    notes/           modelo de notas, ventana visible, separación de manos
  adapters/
    midi/            Web MIDI (entrada) tras una interfaz MidiInput
    youtube/         IFrame API tras la interfaz PlaybackClock
    audio/           Tone.js (piano) tras la misma interfaz
    api/             cliente generado desde OpenAPI + SSE
    storage/         IndexedDB (biblioteca, progreso, desfase por canción)
  ui/                componentes React: pegar enlace, cola, práctica, partitura, biblioteca
  render/            Canvas 2D de notas y teclado
  sheet/             envoltorio de OpenSheetMusicDisplay con cursor guiado por el timemap
```

Principios:
- **Un solo reloj.** `PlaybackClock` entrega `now()`, `seek()`, `setRate()`, `play()` y `pause()`. La implementación de YouTube interpola entre los eventos asíncronos del reproductor para que el dibujo no vaya a saltos; la de Tone.js sirve cuando el video no se puede incrustar (D-05). El canvas, el cursor de la partitura y el modo espera leen siempre ese reloj.
- **Desfase ajustable** (ms) guardado por canción en IndexedDB, con control visible desde la primera versión de la práctica (D-05).
- **El modo espera es una máquina de estados pura:** recibe `(tiempo, notas esperadas, evento MIDI)` y devuelve acciones (`pause`, `seek(t-5)`, `resume`). Es el código más importante de probar. El retroceso (segundos, por defecto 5) es configurable (D-08, "después del MVP" lo ajusta el uso).
- **Detección del navegador** y guía de conexión del teclado en el primer uso (riesgo 6 del estudio).
- **Accesibilidad y diseño:** se usan `frontend-design` o `impeccable` solo al tocar la interfaz (incrementos F3 en adelante), no antes.
- **Sin cuentas:** IndexedDB con exportación e importación de la biblioteca como archivo JSON (D-07), con esquema versionado y migraciones. (rev. 2) La biblioteca guarda también los trabajos pendientes (`job_id`, estado, avisos) y copia el resultado en cuanto lo recoge, para no depender del TTL del servidor.
- **(rev. 2) Nivel de dificultad** (`playable` / `easy`) elegible al practicar; cambiarlo vuelve a pedir el resultado a la caché y reinicia el cursor y las notas esperadas.

## 3. Incrementos

Cada incremento es una rama corta con PR de squash, pruebas en verde, Ruff, mypy, ESLint, Prettier y `tsc --noEmit` limpios, un ADR si cambia la arquitectura y una línea en `docs/status.md`. Las horas salen del estudio (114–172 h en total, de las cuales la Fase 0 ya consumió 8–12 h). La revisión 2 añade unas 13–20 h (asincronía y caché, ByteDance en el worker, reducción de polifonía y su interfaz), así que el MVP queda entre ≈ 127 y 192 h: es más de lo estimado y empuja la fecha de salida; conviene revisarla con el calendario del estudio.

La columna "Bloqueo" indica qué incrementos dependen de la compuerta 1. **Los de bloqueo "No" pueden empezar ya** usando MIDI de prueba generado en código, sin audio protegido. Ya no hay duda sobre el motor; lo único externo que sigue abierto es la descarga desde la VPS.

### Bloque A: servicio de descarga y transcripción (rev. 2: 30–42 h; antes 23–33 h)

| ID | Incremento | Pruebas principales | Bloqueo |
| --- | --- | --- | --- |
| A1 | Dominio y casos de uso del trabajo: máquina de estados, `SubmitJob`, `ProcessJob` con dobles | Unitarias de transiciones y de que el audio se borra también ante errores | No |
| A2 | Cola de un worker con posición y espera estimada, tope de cola, caché de resultados con TTL y `DELETE`, limitador por IP | Unitarias con reloj falso; concurrencia con `asyncio`; expiración de la caché; cola llena | No |
| A3 | API FastAPI: crear trabajo, estado por consulta y por SSE, resultado con `level`, borrado, errores con código; OpenAPI versionado | `httpx` + `TestClient`; prueba de contrato; el trabajo sigue si el cliente se desconecta; ningún log contiene el enlace | No |
| A4 | Worker en subproceso con **ByteDance** (carga única, reinicio cada N canciones, tope de CPU) y medición de memoria; límite de duración por consulta previa | Integración con ByteDance real sobre un fragmento corto de dominio público (marca `slow`); OOM simulado; la API responde mientras el worker transcribe | Checkpoint verificado (ADR 0013) |
| A5 | Descarga real con yt-dlp (directa o por proxy WireGuard) integrada al trabajo | Prueba `network` aparte, verificada en la VPS | Descarga desde la VPS |
| A6 | Despliegue: compose con API y Nginx, volumen de la caché, HTTPS con DuckDNS, `limit_req`, SSE sin búfer, cabeceras, `healthz` | Humo con `curl` en la VPS; imagen arm64 con PyTorch en CI (tamaño y tiempo de construcción) | No (HTTPS sí necesita la VPS) |

### Bloque B: reducción y partitura en el servidor (rev. 2: 26–38 h; antes 20–30 h)

| ID | Incremento | Pruebas principales | Bloqueo |
| --- | --- | --- | --- |
| B1 | Estimación de pulso desde las notas | Propiedades sobre secuencias sintéticas de tempo conocido; errores aceptados documentados | No |
| B1b | **(rev. 2)** `PolyphonyReducer` y `PlayabilityPolicy`: agrupación de acordes, notas fantasma, límite por mano y alcance, melodía y bajo protegidos, niveles `playable` y `easy` | Propiedades (límites, idempotencia, melodía y bajo, sin notas nuevas); fixtures sintéticas con acordes de 15 notas | No |
| B2 | Cuantización y separación de manos | Propiedades (no se pierden ni se crean notas, duraciones suman el compás) | No |
| B3 | `Music21ScoreBuilder`: MusicXML y `timemap` | MusicXML válido (se relee con music21); `timemap` monótono y dentro de la duración | No |
| B4 | Integración de reducción y partitura en `BuildScore` y en la respuesta, recalculable desde la caché | Integración extremo a extremo con melodía sintética; cambiar `level` no vuelve a transcribir | A4 |

### Bloque C: interfaz y práctica (30–45 h + 15–25 h + parte de 20–30 h + 8–12 h)

| ID | Incremento | Pruebas principales | Bloqueo |
| --- | --- | --- | --- |
| C0 | Andamiaje del frontend: Vite, TS estricto, ESLint, Prettier, Vitest, Testing Library, Playwright, CI | La CI corre vacía y falla si algo se rompe | No |
| C1 | `core/practice` (máquina del modo espera) y `core/notes` con una fixture de notas | Vitest exhaustiva: acierto, error, retroceso, mano izquierda o derecha, acordes, notas simultáneas, velocidad | No |
| C2 | `PlaybackClock` y adaptador de YouTube con interpolación; desfase ajustable | Vitest con reproductor falso y temporizadores falsos; medición de deriva en prueba manual | No |
| C3 | Canvas de notas y teclado en pantalla | Pruebas de la función de proyección tiempo→píxel; captura visual en Playwright | No |
| C4 | Web MIDI: entrada, permiso, detección de navegador, guía de conexión | Vitest con `MidiInput` falso; Playwright con `requestMIDIAccess` simulado | No |
| C5 | Pantalla de enlace, cola con espera estimada, trabajos pendientes que sobreviven a cerrar la pestaña, aviso al terminar (Notificaciones, título, sonido) | Testing Library con SSE y consulta simulados; permiso de notificación denegado; cola larga y llena; recuperar un trabajo al reabrir | A3 (contrato) |
| C6 | Partitura con OpenSheetMusicDisplay y cursor del `timemap` | Vitest del cálculo del cursor; Playwright comprueba que el cursor avanza | B3 |
| C7 | Sonido de piano con Tone.js y respaldo cuando el video no se incrusta; velocidad 50 %, 75 % y libre; selector de nivel `playable` / `easy` | Vitest de `setRate` y del cambio de nivel; Playwright con el reproductor bloqueado | C2, A3 |
| C8 | Biblioteca en IndexedDB: guardar, progreso, mejor precisión y velocidad, "dominada" (≥ 90 % de acierto, 100 % de velocidad, sin modo espera), trabajos pendientes, copia local del resultado, exportar e importar | Vitest con `fake-indexeddb`; prueba de migración de esquema | No |
| C9 | Pulido con `frontend-design` o `impeccable`, adaptación a pantallas, accesibilidad | Auditoría con Playwright y axe; revisión visual | C1–C8 |

### Bloque D: cierre del MVP (10–15 h)

| ID | Incremento | Contenido | Bloqueo |
| --- | --- | --- | --- |
| D1 | Flujo principal en Playwright | Pegar enlace → cola → cerrar y reabrir → aviso → práctica con teclado simulado → guardar. Backend real y audio de dominio público (el trabajo se alimenta desde un `AudioDownloader` de archivo local, sin red). Con ByteDance real el flujo corre sobre un fragmento corto y en la CI nocturna, no en cada PR | A4, B4, C5–C8 |
| D2 | Requisitos de salida a público | Términos de uso con la cláusula de derechos, contacto para reclamos, nombre y dominio definitivos (D-03), página con aviso de que la partitura es aproximada | Decisiones de Kevin |
| D3 | Revisión final | Seguridad (`gitleaks`, auditoría de dependencias y licencias permisivas), rendimiento en la VPS (memoria con una canción real), `docs/status.md`, README con capturas | Todo |

**Orden propuesto (rev. 2).** C0 → C1 → A1 → A2 → A3 → C2 → C3 → C4 → B1 → B1b → B2 → B3 → C8 → C5 → C6 → C7 → A4 → A5 → A6 → B4 → C9 → D1 → D2 → D3. La idea es construir primero lo que decide si el producto se siente bien (modo espera y sincronía, riesgo 5 del estudio) con datos sintéticos, y dejar para el final lo que depende de YouTube y de la VPS.

## 4. Estrategia de pruebas

| Capa | Herramienta | Qué se cubre | Dónde corre |
| --- | --- | --- | --- |
| Backend unitaria | pytest, sin red | Dominio, casos de uso, cola, límites, validación, filtro de logs | CI y local |
| Backend integración | pytest `integration` | Basic Pitch real (ONNX) con melodía de dominio público generada en código; music21 real | CI |
| Backend modelo pesado (rev. 2) | pytest `slow` | ByteDance real sobre un fragmento corto (10–20 s) de dominio público; el checkpoint se descarga y verifica con el script de ADR 0013 | CI nocturna y VPS |
| Backend red | pytest `network` | yt-dlp real contra YouTube | Solo en la VPS de Kevin |
| Contrato | OpenAPI versionado + tipos generados | Que backend y frontend no se desincronicen | CI |
| Frontend unitaria | Vitest | Máquina del modo espera, reloj, proyección del canvas, cursor, almacenamiento | CI y local |
| Frontend componentes | Testing Library | Pantalla de enlace, cola, errores, biblioteca, guía de MIDI | CI y local |
| Extremo a extremo | Playwright (Chromium) | Flujo principal con teclado MIDI simulado y reproductor de YouTube simulado | CI |
| No automatizable | Manual | Deriva real del reproductor de YouTube, teclado físico, YouTube y ARM64 reales | VPS y equipo de Kevin |

Reglas:
- **Nada de audio, MIDI ni enlaces de canciones protegidas** en pruebas ni fixtures: se generan en código (melodías de dominio público sintetizadas) y los enlaces de prueba usan IDs ficticios.
- **Cobertura de las partes críticas**: la máquina del modo espera y la estimación de pulso deben tener pruebas de propiedades y casos límite antes de usarlas desde la interfaz. No se fija un porcentaje global: se mide donde el riesgo es alto.
- **Playwright simula Web MIDI** inyectando `navigator.requestMIDIAccess` con `addInitScript`, y simula el reproductor de YouTube interceptando el script de la IFrame API. Así el flujo corre en CI sin teclado ni red. La sincronía real se mide a mano.
- **CI nueva**: trabajo `frontend` (ESLint, Prettier, `tsc`, Vitest, build), trabajo `e2e` (Playwright con trazas apagadas), comprobación de OpenAPI desactualizado y auditoría de licencias de dependencias del frontend. Todo lo que ya existe en la Fase 0 se mantiene.
- Marcas de pytest vigentes: `network`, `integration`, `slow`. La imagen arm64 se sigue construyendo bajo QEMU.

## 5. Riesgos

| N.º (estudio) | Riesgo | Prob. | Impacto | Mitigación en esta fase |
| --- | --- | --- | --- | --- |
| 1 | Mala transcripción que arrastra errores a la partitura | Baja (rev. 2) | Alto | ByteDance elegido por oído; la interfaz marca partitura aproximada |
| 3 | Descarga bloqueada o reclamo | Media | Alto | Proxy WireGuard, proxy de pago de respaldo, archivo como plan B (§8) |
| 5 | Sincronía video, notas y partitura más difícil de lo previsto | Media | Medio | C2 y C3 antes que el resto de la interfaz; desfase ajustable; sonido de piano como alternativa |
| 6 | Fricción con Web MIDI | Media | Bajo | C4, detección de navegador y guía en el primer uso |
| nuevo (rev. 2) | Transcripciones **imposibles de tocar** (15 o más notas a la vez) | Alta | Alto | `PolyphonyReducer` con niveles `playable` y `easy`, melodía y bajo protegidos, MIDI completo descargable, política afinada con canciones difíciles |
| nuevo (rev. 2) | Esperas largas: ≈ 2× la duración por canción y una sola a la vez; una cola de 5 canciones pasa de media hora | Alta | Medio | Posición y espera estimada, aviso al terminar, tope de cola y de trabajos por IP, tope de duración (§9) |
| nuevo (rev. 2) | El worker de ByteDance (CPU al máximo, ≈ 1,5 GB) deja sin respuesta a Nginx y la API, o Oracle lo cuenta como uso | Media | Medio | Tope de CPU del contenedor, reinicio del worker cada N canciones, prueba en A4 de que `healthz` responde bajo carga |
| nuevo (rev. 2) | La caché guarda transcripciones de obras protegidas en el servidor | Media | Medio | TTL de 24 h, solo resultado (sin audio ni enlace), clave aleatoria no derivable del video, `DELETE` explícito, sin catálogo común, ADR que lo justifique (§6) |
| nuevo (rev. 2) | Imagen arm64 con PyTorch grande y lenta de construir bajo QEMU | Media | Bajo | Ruedas CPU de aarch64, caché de capas en CI, medir en A6 |
| nuevo | Estimación de pulso poco fiable (rubato, cambios de tempo) | Alta | Medio | `tempo_confidence`, descarga de MIDI y MusicXML para corregir en MuseScore (D-09) |
| nuevo | Memoria del worker con music21 y Basic Pitch en 12 GB | Baja | Medio | Subproceso por canción, medición en A4; Basic Pitch usa ≈ 500 MB |
| nuevo | Cola volátil: se pierde un trabajo si el servicio reinicia | Media | Bajo | El navegador detecta 404 y ofrece reintentar; se documenta como límite conocido |
| nuevo | YouTube cambia y yt-dlp deja de funcionar | Alta | Alto | Actualización de yt-dlp con `uv lock --upgrade-package`, prueba `network` programada en la VPS, mensaje claro al usuario |
| nuevo | Oracle detiene la instancia | Media | Medio | Compose portable; no se guarda estado en el servidor, así que mudarse es desplegar de nuevo |
| nuevo | Tiempo total mayor que el estimado y choque con la tesis | Media | Medio | Incrementos pequeños, calendario de congelación a finales de febrero de 2027 (estudio) |

## 6. Qué cambiaría la arquitectura

**Contradice hoy el texto de una decisión (rev. 2), y requiere ADR antes de implementarse:**
- **D-07 y el encargo («el servidor no guarda nada»):** la caché de resultados guarda en la VPS notas, MusicXML y mapa de tiempos durante 24 h. Kevin pidió «resultado en caché», pero conviene que el ADR 0015 lo registre explícitamente (el ADR 0014, ya aceptado, deja pendiente la política de caché y borrado), con sus límites (sin audio, sin enlace, clave aleatoria, borrado a petición). Alternativa más estricta: solo memoria con TTL de 2 horas, que se pierde si el servicio reinicia.
- **D-06 (motor):** ahora es ByteDance, y la compuerta de tiempo (< 2 minutos por canción de 3) ya no se cumple. Lo registra el hilo de la Fase 0 (ADR 0006); este plan solo lo toma como entrada.
- **D-08 y D-09:** la práctica y la partitura trabajan sobre notas reducidas (nuevo ADR 0020, ver abajo), no sobre la transcripción cruda.

**Otros puntos donde, si se confirman, hay que avisar a Kevin y escribir un ADR antes de cambiar nada:**

1. **Pulso desde el audio y no desde el MIDI.** D-09 dice "a partir del MIDI". Si B1 no alcanza una precisión aceptable, la alternativa es estimarlo con seguimiento de pulso sobre el audio (librosa, licencia ISC), lo que obliga a conservar el audio en el worker unos segundos más y a extender el puerto `ScoreBuilder`. Cambia D-09 y toca D-07 de forma menor.
2. **El reproductor de YouTube no sincroniza bien.** Si la deriva medida en C2 es inaceptable incluso con interpolación y desfase, el sonido de piano con MIDI pasa a ser el predeterminado y el video queda como referencia visual. Cambia D-05.
3. **Descarga bloqueada también por el proxy** o prohibida por un reclamo: se añade la subida de archivo de audio (multipart, tamaño máximo, mismas reglas de borrado). Cambia D-04 y la API.
4. **Tope de duración (rev. 2).** No está fijado en las decisiones. Con ByteDance una canción de 6 minutos ocupa la VPS ≈ 12 minutos, así que se propone **5 minutos** (≈ 10 de proceso). Se registra en el ADR de límites.
5. **Aviso con la pestaña cerrada** (Web Push): fuera del MVP; si Kevin lo quiere dentro, añade un servicio de push de terceros y revisar la licencia de `pywebpush`.
6. **Reducción de polifonía en el servidor y no en el navegador.** Se prefiere el servidor para que la partitura y las notas salgan de la misma fuente; si se quiere un control más fino por el usuario, pasaría al cliente y habría que duplicar la lógica.

**ADR nuevos que se escribirían (en español, con el formato de `docs/adr/`):**
- 0015 Contrato de API de trabajos, procesamiento asíncrono y caché de resultados (SSE y consulta, `job_id` como credencial, TTL de 24 h, borrado, errores). Modifica D-07.
- 0016 Reloj de reproducción único y sincronía con YouTube.
- 0017 Estimación de pulso, cuantización y mapa de tiempos.
- 0018 Biblioteca local: esquema de IndexedDB, versionado y formato de exportación.
- 0019 Límites de uso (duración, cola, trabajos por IP, tamaños) y política de logs.
- 0020 (rev. 2) Reducción de polifonía y niveles de dificultad: política de tocabilidad, qué notas se protegen y cómo se informa de lo descartado.

## 7. Definición de terminado de la Fase 1

- Todos los incrementos A, B, C y D1 mergeados, con CI en verde (backend, frontend, e2e, imagen arm64).
- Flujo completo funcionando en la VPS con HTTPS: enlace → cola → práctica → biblioteca, con un cover real. **Hasta que Kevin lo pruebe en la VPS, YouTube y ARM64 reales se reportan como no verificados**, como indica `CLAUDE.md`.
- ADR 0006 y 0014 (ByteDance, asíncrono y simplificación) ya escritos por el hilo de la Fase 0 y ADR 0015–0020 escritos.
- (rev. 2) Una canción difícil real se puede practicar con el nivel `playable` sin acordes de más de 10 notas ni más de 5 por mano, y Kevin confirma de oído que sigue siendo reconocible.
- `docs/status.md` al día, runbook de despliegue y operación en `docs/phase-1/`.
- Pendientes de lanzamiento (D2) resueltos antes de abrir el sitio: contacto para reclamos, términos de uso, dominio y nombre.
- La prueba con cinco personas (compuerta 2) pertenece a la Fase 2, como se definió en el encargo.

## 8. Si algo de lo anterior falla (rev. 2)

La compuerta de calidad ya se resolvió por oído a favor de ByteDance. Estos son los escenarios que quedan:

| Escenario | Qué cambia en el plan |
| --- | --- |
| **La descarga sigue bloqueada, incluso con el proxy** | Los incrementos A (salvo A5) y B no cambian. A5 se sustituye por la subida de archivos de audio (multipart, tamaño máximo, mismas reglas de borrado y caché), y D2 incluye en los términos el uso de audio propio. Cambia D-04 y la API (ADR). Con ByteDance conviene limitar el tamaño del archivo igual que la duración. |
| **ByteDance resulta inviable en la VPS** (memoria, tiempo o CPU que ahoga la API) | Se prueba primero con tope de CPU, canciones más cortas y reinicios del worker. Si no basta, Basic Pitch pasa a ser el motor por el mismo puerto `Transcriber`; el resto del plan no cambia, y la reducción de polifonía sirve igual (con menos acordes que reducir). |
| **La reducción deja canciones irreconocibles o sigue siendo difícil** | Se afina la política con las canciones de Kevin; el nivel `easy` es la salida. Si hace falta más, una simplificación por compases (reducir solo los pasajes densos) se evalúa como mejora de Fase 2. |
| **La espera ≈ 2× la duración desanima en la prueba con cinco personas** | Se evalúa un modo de vista previa con Basic Pitch (rápido) mientras ByteDance termina. No está en este plan: es decisión de producto para la Fase 2. |
| **Se abandona la transcripción** (descarga y motor inviables) | La entrada pasa a ser un archivo MIDI y la herramienta se reduce a práctica con retroceso, como prevé el estudio. Los bloques B y C se conservan casi completos, incluida la reducción de polifonía; A se reduce a servir la partitura desde un MIDI, o se mueve al navegador. |

## 9. Preguntas para Kevin (rev. 2)

1. **¿Empiezo ya los incrementos sin bloqueo** (C0–C4, A1–A3, B1–B3 con B1b, C8)? Ya no depende de ninguna compuerta de calidad. Es lo que recomiendo.
2. **Caché de resultados** (cambia D-07): ¿24 horas en un volumen del servidor, con clave aleatoria y borrado a petición? La alternativa estricta es memoria con 2 horas.
3. **Tope de duración:** ¿5 minutos (≈ 10 de proceso)? Con 6 serían ≈ 12.
4. **Tope de cola y de uso:** ¿10 trabajos en cola y 2 activos por IP? Con ≈ 6 minutos por canción, 10 trabajos son una hora de espera.
5. **Aviso al terminar:** ¿basta con notificación del navegador, título y sonido con la pestaña abierta, y marca de «lista» al volver? Web Push queda fuera del MVP.
6. **Reducción de polifonía:** ¿te sirven los límites propuestos (5 notas por mano, décima de alcance, 10 en total; `easy` con 4, octava y 8) y los dos niveles? Los afinamos con tus canciones difíciles; ¿puedes pasarme cuáles son (sin audio) para armar fixtures sintéticas con esa forma?
7. **Nombre del proyecto:** `teclario` sigue provisional; hace falta antes de D2 y del dominio.
