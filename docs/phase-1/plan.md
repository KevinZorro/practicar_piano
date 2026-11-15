# Plan de la Fase 1: MVP completo

- Fecha: 2026-11-15
- Estado: **Propuesta, pendiente del visto bueno de Kevin.** No se escribe código de la Fase 1 hasta que se apruebe.
- Fuentes de verdad: estudio de viabilidad y registro de decisiones (D-01 a D-12), resumidos en `docs/adr/`.
- Skills aplicadas: `arquitectura-y-datos` (contrato de API, módulos, ADR), `calidad-y-seguridad` (pruebas, CI, límites, privacidad), `desarrollo-senior` (incrementos pequeños, commits convencionales).

## 1. Alcance y punto de partida

**Objetivo.** El usuario pega el enlace de un cover de piano, espera su turno en la cola, y practica con su teclado USB: notas cayendo, partitura sincronizada, modo espera con retroceso, velocidad ajustable y biblioteca con progreso. Sin cuentas.

**Dentro** (tabla del estudio, "Incluido en el MVP"): descarga y transcripción en la VPS, notas cayendo, partitura, Web MIDI, modo espera, velocidad, biblioteca y progreso.
**Fuera**: subida de archivos (salvo que falle la descarga, ver §8), varios instrumentos, corrección de partitura, Android, cuentas, anuncios.

**Estado heredado de la Fase 0** (rama `claude/project-thread-7gi51h`, sin modificar):
- Backend hexagonal con puertos `AudioDownloader`, `Transcriber`, `Synthesizer`, `ResourceMeter`; `VideoUrl` valida enlaces; Basic Pitch (ONNX) y ByteDance como adaptadores; Dockerfile arm64 con Deno y ffmpeg; CI con Ruff, mypy estricto, pytest y gitleaks.
- Compuerta 1 **abierta**. Basic Pitch cumple el tiempo de sobra en la VPS (factor 0,04–0,12 frente al presupuesto de 0,67; unos 500 MB). ByteDance no (factor ≈ 2,0; ≈ 1,5 GB). Faltan: el oído de Kevin sobre 8 de 10 canciones reconocibles, y una descarga que funcione desde la VPS (YouTube la bloquea; el proxy por WireGuard se prepara aparte).

**Supuesto de este plan:** Basic Pitch es el motor. Lo que cambia si la compuerta falla está en §8.

## 2. Arquitectura objetivo

```mermaid
sequenceDiagram
  participant B as Navegador
  participant N as Nginx
  participant A as API FastAPI
  participant W as Worker (subproceso)
  B->>N: POST /api/v1/jobs {url}
  N->>A: valida enlace, duración y límite por IP
  A-->>B: 202 {job_id}
  B->>A: GET /api/v1/jobs/{id}/events (SSE)
  A->>W: descarga con yt-dlp y transcribe (una canción a la vez)
  W-->>A: notas, MIDI, MusicXML, mapa de tiempos (en memoria)
  A-->>B: eventos: queued(pos) → downloading → transcribing → scoring → done
  B->>A: GET /api/v1/jobs/{id}/result
  A-->>B: resultado (se borra de memoria al entregarlo)
  Note over A,W: el audio se borra siempre; nada se escribe en disco ni se registra el enlace
```

### 2.1 Backend (`backend/src/pianola/`)

Se mantiene la regla `cli/api → application → domain`; `infrastructure` implementa los puertos.

| Capa | Nuevo en la Fase 1 |
| --- | --- |
| `domain` | `Job` y su máquina de estados (`queued → downloading → transcribing → scoring → done / failed / expired`), `NoteEvent`, `Transcription`, `Score` (MusicXML + mapa de tiempos), `DurationPolicy`, errores con código estable |
| `application` | Casos de uso `SubmitJob`, `GetJobStatus`, `FetchResult`; `ProcessJob` (descarga → transcribe → arma partitura → borra); puertos nuevos `JobQueue`, `JobStore`, `ScoreBuilder`, `RateLimiter`, `Clock` |
| `infrastructure` | Cola en memoria con un worker; almacén en memoria con TTL y borrado al entregar; `Music21ScoreBuilder`; limitador por IP; adaptadores existentes sin cambios |
| `api` (nueva) | FastAPI: rutas, esquemas Pydantic, SSE, manejo de errores, lectura de IP real tras Nginx, `/healthz` |

Decisiones de diseño que sostienen las reglas de D-07 y de seguridad:
- **Worker en subproceso**, como ya hace el medidor de la Fase 0: un OOM o un fallo de yt-dlp no tumba la API y la memoria vuelve al sistema tras cada canción. El modelo se carga una vez al arrancar el worker.
- **Resultado solo en memoria**, con TTL corto (propuesta: 10 minutos) y borrado al entregarlo. Si el navegador no lo recoge, se pierde y el usuario reenvía el enlace. Es la lectura estricta de D-07.
- **La cola es volátil.** Si el servicio reinicia, los trabajos se pierden y el navegador lo detecta (404) y ofrece reintentar. Una cola persistente sería más trabajo y guardaría enlaces: se descarta.
- **Seguridad** (`calidad-y-seguridad`): enlace validado por `VideoUrl` antes de tocar la red; duración consultada con yt-dlp sin descargar y rechazada si pasa el máximo; tope de trabajos por IP en cola y por hora; tamaño máximo del cuerpo; sin enlaces en logs (filtro de logging con prueba que lo verifica); secretos solo por variables de entorno; Nginx añade `limit_req` y cabeceras de seguridad; CORS cerrado al propio dominio.
- **Contrato**: el esquema OpenAPI se genera desde FastAPI, se versiona en `docs/api/openapi.json` y el frontend genera sus tipos con `openapi-typescript`. CI falla si el archivo queda desactualizado.

**Respuesta del resultado** (propuesta): `{ meta: {duration_s, tempo_bpm, time_signature}, notes: [{pitch, start_s, end_s, velocity, hand}], midi_b64, musicxml, timemap: [{measure, start_s}] }`. El `timemap` es lo que permite mover el cursor de la partitura al ritmo del video sin que el navegador tenga que adivinar compases.

**Partitura (D-09).** Pulso estimado desde el MIDI (histograma de intervalos entre inicios, con prueba sobre melodías sintéticas de tempo conocido), cuantización a rejilla de semicorcheas o tresillos con tolerancia, manos con la regla del do central (D-08), construcción con music21 y salida MusicXML. Cada paso es una función pura con pruebas de propiedades. Si el tempo no es estable el resultado marca `tempo_confidence: low` y la interfaz avisa que la partitura es aproximada.

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
- **Sin cuentas:** IndexedDB con exportación e importación de la biblioteca como archivo JSON (D-07), con esquema versionado y migraciones.

## 3. Incrementos

Cada incremento es una rama corta con PR de squash, pruebas en verde, Ruff, mypy, ESLint, Prettier y `tsc --noEmit` limpios, un ADR si cambia la arquitectura y una línea en `docs/status.md`. Las horas salen del estudio (114–172 h en total, de las cuales la Fase 0 ya consumió 8–12 h).

La columna "Bloqueo" indica qué incrementos dependen de la compuerta 1. **Los de bloqueo "No" pueden empezar ya** usando MIDI de prueba generado en código, sin audio protegido.

### Bloque A: servicio de descarga y transcripción (23–33 h)

| ID | Incremento | Pruebas principales | Bloqueo |
| --- | --- | --- | --- |
| A1 | Dominio y casos de uso del trabajo: máquina de estados, `SubmitJob`, `ProcessJob` con dobles | Unitarias de transiciones y de que el audio se borra también ante errores | No |
| A2 | Cola de un worker, almacén con TTL y borrado al entregar, limitador por IP | Unitarias con reloj falso; concurrencia con `asyncio` | No |
| A3 | API FastAPI: crear trabajo, SSE de estado, resultado, errores con código; OpenAPI versionado | `httpx` + `TestClient`; prueba de contrato; prueba de que ningún log contiene el enlace | No |
| A4 | Worker en subproceso con Basic Pitch y medición de memoria; límite de duración por consulta previa | Integración con Basic Pitch real y melodía de dominio público; prueba de OOM simulado | Motor (§8) |
| A5 | Descarga real con yt-dlp (directa o por proxy WireGuard) integrada al trabajo | Prueba `network` aparte, verificada en la VPS | Descarga desde la VPS |
| A6 | Despliegue: compose con API y Nginx, HTTPS con DuckDNS, `limit_req`, cabeceras, `healthz` | Humo con `curl` en la VPS; imagen arm64 en CI | No (HTTPS sí necesita la VPS) |

### Bloque B: partitura en el servidor (parte de 20–30 h)

| ID | Incremento | Pruebas principales | Bloqueo |
| --- | --- | --- | --- |
| B1 | Estimación de pulso desde las notas | Propiedades sobre secuencias sintéticas de tempo conocido; errores aceptados documentados | No |
| B2 | Cuantización y separación de manos | Propiedades (no se pierden ni se crean notas, duraciones suman el compás) | No |
| B3 | `Music21ScoreBuilder`: MusicXML y `timemap` | MusicXML válido (se relee con music21); `timemap` monótono y dentro de la duración | No |
| B4 | Integración de la partitura en `ProcessJob` y en la respuesta | Integración extremo a extremo con melodía sintética | Motor |

### Bloque C: interfaz y práctica (30–45 h + 15–25 h + parte de 20–30 h + 8–12 h)

| ID | Incremento | Pruebas principales | Bloqueo |
| --- | --- | --- | --- |
| C0 | Andamiaje del frontend: Vite, TS estricto, ESLint, Prettier, Vitest, Testing Library, Playwright, CI | La CI corre vacía y falla si algo se rompe | No |
| C1 | `core/practice` (máquina del modo espera) y `core/notes` con una fixture de notas | Vitest exhaustiva: acierto, error, retroceso, mano izquierda o derecha, acordes, notas simultáneas, velocidad | No |
| C2 | `PlaybackClock` y adaptador de YouTube con interpolación; desfase ajustable | Vitest con reproductor falso y temporizadores falsos; medición de deriva en prueba manual | No |
| C3 | Canvas de notas y teclado en pantalla | Pruebas de la función de proyección tiempo→píxel; captura visual en Playwright | No |
| C4 | Web MIDI: entrada, permiso, detección de navegador, guía de conexión | Vitest con `MidiInput` falso; Playwright con `requestMIDIAccess` simulado | No |
| C5 | Pantalla de enlace, cola y progreso con el cliente generado | Testing Library con SSE simulado; estados vacío, error y cola larga | A3 (contrato) |
| C6 | Partitura con OpenSheetMusicDisplay y cursor del `timemap` | Vitest del cálculo del cursor; Playwright comprueba que el cursor avanza | B3 |
| C7 | Sonido de piano con Tone.js y respaldo cuando el video no se incrusta; velocidad 50 %, 75 % y libre | Vitest de `setRate`; Playwright con el reproductor bloqueado | C2 |
| C8 | Biblioteca en IndexedDB: guardar, progreso, mejor precisión y velocidad, "dominada" (≥ 90 % de acierto, 100 % de velocidad, sin modo espera), exportar e importar | Vitest con `fake-indexeddb`; prueba de migración de esquema | No |
| C9 | Pulido con `frontend-design` o `impeccable`, adaptación a pantallas, accesibilidad | Auditoría con Playwright y axe; revisión visual | C1–C8 |

### Bloque D: cierre del MVP (10–15 h)

| ID | Incremento | Contenido | Bloqueo |
| --- | --- | --- | --- |
| D1 | Flujo principal en Playwright | Pegar enlace → cola → práctica con teclado simulado → guardar. Backend real con Basic Pitch y audio de dominio público (el trabajo se alimenta desde un `AudioDownloader` de archivo local, sin red) | A4, B4, C5–C8 |
| D2 | Requisitos de salida a público | Términos de uso con la cláusula de derechos, contacto para reclamos, nombre y dominio definitivos (D-03), página con aviso de que la partitura es aproximada | Decisiones de Kevin |
| D3 | Revisión final | Seguridad (`gitleaks`, auditoría de dependencias y licencias permisivas), rendimiento en la VPS (memoria con una canción real), `docs/status.md`, README con capturas | Todo |

**Orden propuesto.** C0 → C1 → A1 → A2 → A3 → C2 → C3 → C4 → B1 → B2 → B3 → C8 → C5 → C6 → C7 → A4 → A5 → A6 → B4 → C9 → D1 → D2 → D3. La idea es construir primero lo que decide si el producto se siente bien (modo espera y sincronía, riesgo 5 del estudio) con datos sintéticos, y dejar para el final lo que depende de YouTube y de la VPS.

## 4. Estrategia de pruebas

| Capa | Herramienta | Qué se cubre | Dónde corre |
| --- | --- | --- | --- |
| Backend unitaria | pytest, sin red | Dominio, casos de uso, cola, límites, validación, filtro de logs | CI y local |
| Backend integración | pytest `integration` | Basic Pitch real con melodía de dominio público generada en código; music21 real | CI (ONNX) |
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
| 1 | Mala transcripción que arrastra errores a la partitura | Media | Alto | Compuerta 1; umbrales de Basic Pitch ajustables; la interfaz marca partitura aproximada |
| 3 | Descarga bloqueada o reclamo | Media | Alto | Proxy WireGuard, proxy de pago de respaldo, archivo como plan B (§8) |
| 5 | Sincronía video, notas y partitura más difícil de lo previsto | Media | Medio | C2 y C3 antes que el resto de la interfaz; desfase ajustable; sonido de piano como alternativa |
| 6 | Fricción con Web MIDI | Media | Bajo | C4, detección de navegador y guía en el primer uso |
| nuevo | Estimación de pulso poco fiable (rubato, cambios de tempo) | Alta | Medio | `tempo_confidence`, descarga de MIDI y MusicXML para corregir en MuseScore (D-09) |
| nuevo | Memoria del worker con music21 y Basic Pitch en 12 GB | Baja | Medio | Subproceso por canción, medición en A4; Basic Pitch usa ≈ 500 MB |
| nuevo | Cola volátil: se pierde un trabajo si el servicio reinicia | Media | Bajo | El navegador detecta 404 y ofrece reintentar; se documenta como límite conocido |
| nuevo | YouTube cambia y yt-dlp deja de funcionar | Alta | Alto | Actualización de yt-dlp con `uv lock --upgrade-package`, prueba `network` programada en la VPS, mensaje claro al usuario |
| nuevo | Oracle detiene la instancia | Media | Medio | Compose portable; no se guarda estado en el servidor, así que mudarse es desplegar de nuevo |
| nuevo | Tiempo total mayor que el estimado y choque con la tesis | Media | Medio | Incrementos pequeños, calendario de congelación a finales de febrero de 2027 (estudio) |

## 6. Qué cambiaría la arquitectura

Ningún elemento de este plan contradice D-01 a D-12. Estos son los puntos donde, si se confirman, hay que **avisar a Kevin y escribir un ADR antes de cambiar nada**:

1. **Pulso desde el audio y no desde el MIDI.** D-09 dice "a partir del MIDI". Si B1 no alcanza una precisión aceptable, la alternativa es estimarlo con seguimiento de pulso sobre el audio (librosa, licencia ISC), lo que obliga a conservar el audio en el worker unos segundos más y a extender el puerto `ScoreBuilder`. Cambia D-09 y toca D-07 de forma menor.
2. **El reproductor de YouTube no sincroniza bien.** Si la deriva medida en C2 es inaceptable incluso con interpolación y desfase, el sonido de piano con MIDI pasa a ser el predeterminado y el video queda como referencia visual. Cambia D-05.
3. **Descarga bloqueada también por el proxy** o prohibida por un reclamo: se añade la subida de archivo de audio (multipart, tamaño máximo, mismas reglas de borrado). Cambia D-04 y la API.
4. **Tope de duración.** No está fijado en las decisiones; se propone 6 minutos, porque con Basic Pitch el tiempo no es el límite sino el uso de la cola. No es contradicción, pero se registra en un ADR.
5. **Resultado entregado una sola vez, con TTL.** Interpretación estricta de D-07; si Kevin prefiere permitir releer durante unos minutos, se ajusta en el ADR de la API.
6. **ByteDance como motor** (solo si cambia el panorama): cambiaría tiempos, memoria y el diseño de la cola. Ver §8.

**ADR nuevos que se escribirían (en español, con el formato de `docs/adr/`):**
- 0014 Contrato de API de trabajos y ciclo de vida del resultado (SSE, TTL, borrado al entregar, errores).
- 0015 Reloj de reproducción único y sincronía con YouTube.
- 0016 Estimación de pulso, cuantización y mapa de tiempos.
- 0017 Biblioteca local: esquema de IndexedDB, versionado y formato de exportación.
- 0018 Límites de uso (duración, trabajos por IP, tamaños) y política de logs.

## 7. Definición de terminado de la Fase 1

- Todos los incrementos A, B, C y D1 mergeados, con CI en verde (backend, frontend, e2e, imagen arm64).
- Flujo completo funcionando en la VPS con HTTPS: enlace → cola → práctica → biblioteca, con un cover real. **Hasta que Kevin lo pruebe en la VPS, YouTube y ARM64 reales se reportan como no verificados**, como indica `CLAUDE.md`.
- ADR 0006 actualizado a Aceptada o Reemplazada y ADR 0014–0018 escritos.
- `docs/status.md` al día, runbook de despliegue y operación en `docs/phase-1/`.
- Pendientes de lanzamiento (D2) resueltos antes de abrir el sitio: contacto para reclamos, términos de uso, dominio y nombre.
- La prueba con cinco personas (compuerta 2) pertenece a la Fase 2, como se definió en el encargo.

## 8. Si la compuerta 1 falla

| Escenario | Qué cambia en el plan |
| --- | --- |
| **Basic Pitch pasa de oído (≥ 8 de 10) y hay descarga** | El plan sigue tal cual. ADR 0006 pasa a Aceptada. |
| **Basic Pitch pasa, pero la descarga sigue bloqueada** | Los incrementos A y B no cambian. A5 se sustituye por la subida de archivos (§6, punto 3) y D2 incluye en los términos el uso de audio propio. Se pospone la descarga y se prueba otra vez con el proxy; no se invierte en interfaz de enlace hasta tener una decisión. |
| **Basic Pitch no llega a 8 de 10** | Primero se afinan umbrales de inicio y duración mínima, que es barato. Si no basta, la compuerta lo dice el estudio: la entrada pasa a ser un archivo MIDI y la herramienta se reduce a práctica con retroceso. Los bloques C y B se conservan casi completos; A se reduce a generar la partitura desde un MIDI (o se mueve al navegador) y desaparecen cola, yt-dlp, proxy y motor de transcripción. Se escribe un ADR que reemplaza D-04, D-06 y parte de D-02. |
| **ByteDance suena mejor pero tarda** | Con un factor de ≈ 2,0 una canción de 3 minutos tarda unos 6 minutos, el triple del presupuesto de 2 minutos, y la memoria sube a ≈ 1,5 GB. Solo se adoptaría con un ADR que cambie el criterio de tiempo y la experiencia de la cola (por ejemplo, "calidad alta" opcional con aviso de espera). Es una decisión de producto de Kevin, y por defecto este plan **no** la toma. |

## 9. Preguntas para Kevin

1. **¿Empiezo ya los incrementos sin bloqueo (C0–C4, A1–A3, B1–B3, C8) mientras se cierra la compuerta 1?** Se construyen con datos sintéticos y no dependen del motor ni de YouTube. Es lo que recomiendo, porque son la mayor parte de las horas y los que más riesgo de calendario tienen.
2. **Tope de duración**: ¿6 minutos te sirve?
3. **Resultado de una sola entrega con TTL de 10 minutos** (§2.1): ¿lo aceptas, o prefieres poder releerlo un rato?
4. **Entrega de estados por SSE** en vez de consulta periódica: ¿de acuerdo? (Con Nginx basta desactivar el búfer en esa ruta.)
5. **Nombre del proyecto**: el repositorio sigue con `pianola` provisional. Hace falta definirlo antes de D2 y del dominio.
