# 0001. D-01 Aplicación web para Chrome y Edge

- Fecha: 2026-11-14
- Estado: Aceptada
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-01)

## Contexto
El usuario debe practicar sin instalar nada y el sitio podrá llevar banners más adelante (D-10). La Web MIDI API funciona en Chrome (desde la 43) y Edge (desde la 79); en Firefox exige un complemento y Safari no la implementa. Requiere HTTPS (D-03) y gestionar el permiso que Chrome pide desde la versión 124.

## Decisión
Aplicación web dirigida a Chrome y Edge de escritorio. La interfaz detecta el navegador y recomienda Chrome o Edge.

## Alternativas consideradas
- Aplicación de escritorio (Electron/Tauri): bajaría el audio sin proxy, pero obliga a instalar y choca con la meta web.
- Aplicación móvil: Safari en iOS no implementa Web MIDI y conectar un teclado al celular complica la primera prueba.

## Consecuencias
Se sirve bajo HTTPS. Firefox y Safari quedan fuera del MVP. Una versión Android queda para después del MVP.
