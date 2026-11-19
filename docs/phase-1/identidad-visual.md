# Identidad visual de Notacaida

Fecha: 2026-11-19. Kevin delegó las decisiones de diseño («hazlo bien… elegir una identidad, los colores, verificar si está acorde con el objetivo de la aplicación»). Este documento las fija; el contexto del producto está en `PRODUCT.md` y los valores exactos en `frontend/src/styles/tokens.css` y `frontend/src/render/notePalette.ts`.

## 1. De qué parte el diseño

- **Es un instrumento, no una página.** Quien la usa está sentado al teclado, con las dos manos ocupadas, mirando una pantalla a 60–80 cm. Lo que importa mientras toca (notas, partitura, tiempo, qué tecla sigue) tiene que leerse de un vistazo; los ajustes se tocan antes o entre pasadas.
- **Enseña a leer.** El primer usuario conoce las letras (C, D, E…) y está aprendiendo el pentagrama. La interfaz tiene que unir las dos cosas: la tecla, la barra que cae y la nota escrita son la misma nota.
- **Honesta.** La transcripción es automática y puede equivocarse; se dice sin rodeos.

## 2. Concepto: «Metalófono»

Los metalófonos escolares y muchos métodos para principiantes pintan cada nota de un color. Notacaida lo convierte en sistema: **Do es rojo** en la pegatina de la tecla, en la barra que cae, en la cabeza de la nota de la partitura, en su nombre debajo del pentagrama y en la guía. El color es el puente entre las teclas y la partitura.

Todo lo demás es el **estuche del instrumento**: marrones muy oscuros y cálidos, tinta crema y ningún color propio. La música pone el color; la interfaz no compite con ella.

Rasgos que se repiten:

- **Botones como teclas.** La acción principal es una tecla de marfil sobre el estuche oscuro (y una tecla negra en el tema claro); las secundarias son teclas negras. Tienen un canto inferior y bajan 1 px al pulsarlas.
- **Filas de teclas** para elegir entre pocas opciones (vista, nivel, velocidad, manos, nombres de las notas), en lugar de desplegables.
- **Foco de resaltador**: el contorno de foco es amarillo de subrayador (#f4d248 en oscuro, #8a6500 en claro), como quien marca la partitura.
- **La partitura siempre en papel** (#fffdf8) y el escenario de las notas siempre oscuro, sea cual sea el tema del sistema. La pantalla de práctica usa siempre el estuche oscuro.

## 3. Color

### 3.1 Una nota, un color

Cada nota lleva el color de la letra en la que se escribe (C♯ es roja como C). Hay dos juegos de la misma familia: el del escenario oscuro y uno más profundo para el papel. Calibrados en OKLCH para que pesen parecido.

| Nota | Escenario | Letra encima | Sobre el escenario | Papel | Sobre el papel |
|---|---|---|---|---|---|
| C · Do | `#f56056` | 5,8:1 | 5,9:1 | `#d02c2a` | 5,1:1 |
| D · Re | `#f89845` | 8,3:1 | 8,5:1 | `#b85801` | 4,6:1 |
| E · Mi | `#f3d146` | 12,1:1 | 12,4:1 | `#926e06` | 4,6:1 |
| F · Fa | `#71d268` | 9,6:1 | 9,8:1 | `#168629` | 4,6:1 |
| G · Sol | `#3fc8c4` | 8,9:1 | 9,1:1 | `#058181` | 4,6:1 |
| A · La | `#5aa6f2` | 7,0:1 | 7,2:1 | `#226bc0` | 5,3:1 |
| B · Si | `#c184e5` | 6,6:1 | 6,8:1 | `#8c42aa` | 5,9:1 |

«Letra encima» es la tinta `#1a1511` sobre la barra o la pegatina; «sobre el escenario» es el color sobre `#18120f`; «sobre el papel» es el color sobre `#fffdf8`. Todo pasa AA para texto pequeño (4,5:1), porque los nombres de las notas son texto.

**Regla:** el color nunca va solo. Cada barra, tecla y nota escrita lleva también su nombre, para quien no distingue colores o lee en una pantalla mala.

### 3.2 Interfaz

| Token | Oscuro (estuche) | Claro (papel) | Uso |
|---|---|---|---|
| `--bg` | `#110c0a` | `#f4efe6` | Fondo de la página |
| `--surface` | `#1a1411` | `#fbf8f2` | Paneles, barra superior |
| `--raised` | `#241c18` | `#ffffff` | Tarjetas, campos |
| `--text` | `#f3ece0` (16,5:1) | `#1e1814` (15,3:1) | Texto principal |
| `--text-2` | `#cdc2b4` (11,1:1) | `#4a4038` (8,8:1) | Texto secundario |
| `--text-3` | `#a89c8f` (7,2:1) | `#63584e` (6,0:1) | Notas al pie, metadatos |
| `--danger` | `#ff9b8c` (9,5:1) | `#b42318` (5,7:1) | Errores, borrar |
| `--focus` | `#f4d248` (13,1:1) | `#8a6500` (4,7:1) | Contorno de foco |
| `--line-strong` | `#85766a` (4,4:1) | `#887965` (3,7:1) | Bordes de controles |
| `--primary` / texto | `#f2ece1` / `#1c1613` (15,2:1) | `#231b17` / `#f7f1e6` (15,1:1) | Tecla principal |

Contrastes medidos sobre `--bg`. La prueba `src/styles/tokens.test.ts` lee `tokens.css` y falla si un par baja de AA (texto ≥ 4,5:1, teclas ≥ 7:1, foco y bordes ≥ 3:1) o si los colores de nota del CSS se separan de `notePalette.ts`.

El tema claro sigue la preferencia del sistema en la portada, la biblioteca y los términos; la práctica no cambia.

## 4. Tipografía

- **Atkinson Hyperlegible Next** (Braille Institute), variable, en toda la interfaz y en los nombres de las notas dentro de la partitura. Se eligió por legibilidad a distancia: letras inconfundibles (I, l y 1; O y 0), aperturas amplias, acentos claros en español y cifras que no se confunden en el tiempo y el compás. Se sirve desde el propio sitio (paquete `@fontsource-variable`, solo latín y latín extendido), sin peticiones a terceros.
- Licencia SIL OFL 1.1: no está en la lista de licencias del proyecto, ver [ADR 0021](../adr/0021-fuente-atkinson-hyperlegible.md) (propuesta).
- Escala corta, pensada para una herramienta: 0,75 / 0,8125 / 0,875 / 0,9375 / 1 / 1,0625 / 1,25 / 1,375 rem, y el titular de la portada con `clamp(1,5rem, 2,4vw, 2rem)`. Pesos 400, 600, 700 y 800 (el logotipo).
- Cifras tabulares (`.num`) en tiempo, compás, velocidad, porcentajes y duraciones, para que no bailen al cambiar.
- En la partitura los nombres de las notas van en negrita (`FontStyles.Bold` de OpenSheetMusicDisplay) y del color de su nota.

## 5. Nombre, logotipo e imágenes

- **Marca:** Do, Mi y Sol (el primer acorde de casi cualquier método) cayendo hacia la línea de impacto crema, sobre un cuadrado oscuro redondeado. Es el mismo dibujo en `ui/Logo.tsx` y en `public/favicon.svg`; legible a 16 px.
- **Logotipo:** «Notacaida» en Atkinson Hyperlegible Next, peso 800, tinta del tema.
- **Imagen para compartir** (`public/og-image.png`, 1200×630): marca, logotipo, lema, una tira de metalófono con las siete notas y una escena de notas cayendo sobre el teclado. Hecha con código (HTML y SVG con los mismos tokens, renderizada con Playwright); no hay imágenes generadas ni de terceros.
- **Capturas del README** (`docs/img/`): el ejercicio sintético de las pruebas e2e, nunca una canción real.

## 6. Voz y tono

- Español, de **tú**, frases cortas y con verbo: «Pega el enlace», «Toca las notas indicadas para continuar».
- Explica qué pasa y qué hacer, sin culpar: «No se pudo descargar la canción. Inténtalo de nuevo.»
- Honestidad sobre la transcripción: «Transcripción automática: puede contener errores.»
- Exclamaciones solo para celebrar un logro del usuario: «¡Lista!», «¡Terminaste!».
- Nada de cifras de usuarios, testimonios ni promesas que no se puedan comprobar.
- Términos musicales en su forma española (clave de sol, puntillo, ligadura, compás, armadura), con la letra al lado cuando ayuda: «Do central (C4)».

## 7. Componentes

| Componente | Dónde | Notas |
|---|---|---|
| Tecla principal / secundaria / peligro (`.key-primary`, `.key-quiet`, `.key-danger`) | Todo | Altura mínima 44 px; canto inferior; foco de resaltador |
| Fila de teclas (`KeyRow`) | Vista, nivel, velocidad, manos, nombres | Radios nativos debajo; flechas del teclado para moverse |
| Interruptor con explicación (`Switch`) | Ajustes | La explicación va fuera de la etiqueta y se asocia con `aria-describedby` |
| Panel (`.panel`) | Columna de ajustes | Título corto; una sola idea por panel |
| Fichas del modo espera (`.chip`) | Barra de transporte | Una por nota esperada, de su color; se apagan al tocarla |
| Tarjeta de canción (`LibraryList`) | Biblioteca | Huella de los primeros 12 s con los colores de las notas, progreso, renombrar y borrar con confirmación |
| Pasos del trabajo (`JobList`) | En proceso | Cola · Audio · Notas · Partitura |
| Aviso (`.notice`) | Formularios | Icono + texto; `role="alert"` o `role="status"` según urja |
| Guía de lectura (`ReadingGuide`) | Portada y práctica | Panel lateral no modal; Escape cierra y devuelve el foco; ejemplos dibujados con el mismo motor que la partitura |
| Teclado dibujado (`MiniKeyboard`) | Portada y guía | Pegatina de color y nombre en cada tecla blanca |

## 8. Disposición

- **Portada:** a la izquierda, el enlace, los trabajos en proceso y la biblioteca; a la derecha, «Cómo funciona» y la leyenda de colores (fija al desplazarse). En móvil todo va en una columna.
- **Práctica:** barra superior (volver, título, vista, guía), escenario (partitura arriba y notas que caen abajo, o una sola de las dos), barra de transporte (reproducir, reiniciar, línea de tiempo, compás) y columna de ajustes de 360 px (vídeo, cómo tocarla, tu teclado, lectura). La vista elegida se guarda y nada la cambia por su cuenta.
- **Puntos de quiebre:** 1023 px (una columna; la barra de transporte queda fija abajo) y 560 px (botones de volver y guía solo con icono, formulario en una columna).

## 9. Movimiento

Poco y con propósito: el botón baja al pulsarlo, la guía entra deslizándose, los pasos del trabajo en curso laten despacio. Curva `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`). Mientras suena la canción no se anima nada de la interfaz. Con `prefers-reduced-motion` todo se reduce a un instante.

## 10. Accesibilidad

- Contraste comprobado en pruebas (`tokens.test.ts`, `render.test.ts`), no a ojo.
- Foco visible en todo; orden de tabulación natural; Espacio reproduce o pausa fuera de los controles; Escape cierra la guía.
- Objetivos táctiles de 44 px con puntero grueso.
- El escenario es un `canvas` con `role="img"` y nombre; el modo espera anuncia su progreso con `role="status"`.
- Color siempre acompañado de nombre (ver 3.1).
- Sin auditoría automática con axe (MPL-2.0, fuera de la lista de licencias; ADR 0012).

## 11. Pendiente y sin verificar

- Probarlo con el piano real a la distancia de uso y con Kevin leyendo la partitura.
- YouTube real y el micrófono con el Vangoa: siguen sin verificar en este cambio (se probaron con dobles).
- Visto bueno de Kevin a la fuente (ADR 0021).
