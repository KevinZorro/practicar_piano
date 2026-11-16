# 0013. Cargar el modelo de ByteDance con un checkpoint verificado

- Fecha: 2026-11-15
- Estado: Propuesta
- Relacionada con: [0006](0006-motor-de-transcripcion.md), [0012](0012-licencias.md)

## Contexto
Al implementar el adaptador de la Fase 0 se revisó el paquete `piano_transcription_inference` 0.0.6 y aparecieron tres puntos que el registro de decisiones no cubría:

1. **Descarga sin verificación.** Si no encuentra el checkpoint, el paquete ejecuta `wget` contra Zenodo (`os.system`) y solo comprueba el tamaño del archivo.
2. **Carga con pickle.** El checkpoint se abre con `torch.load(...)`. Con PyTorch anterior a 2.6 eso puede ejecutar código arbitrario si el archivo está manipulado; desde 2.6 el valor por defecto es `weights_only=True`.
3. **Licencias.** El registro (D-12) dice Apache 2.0 para el modelo, pero los metadatos del paquete en PyPI declaran MIT, y la licencia del checkpoint en Zenodo no se pudo comprobar desde el entorno de desarrollo (el acceso a Zenodo está bloqueado allí). Ambas licencias del código son permisivas, así que D-12 no se contradice, pero los avisos de `NOTICE` deben decir lo correcto.

## Decisión
- El adaptador exige una ruta de checkpoint explícita y se niega a correr si el archivo falta o está incompleto; nunca deja que el paquete descargue por su cuenta.
- `backend/scripts/fetch_bytedance_checkpoint.sh` descarga con `curl` y verifica el SHA-256 contra `bytedance_checkpoint.sha256`. En el primer uso imprime el hash para fijarlo (confianza en el primer uso) y se contrasta con el checksum que muestra Zenodo.
- La dependencia `torch` se fija en 2.6 o superior.
- Antes de cerrar la Fase 0 se anota en `docs/phase-0/model-licenses.md` la licencia real del código y del checkpoint. Si el checkpoint no permite el uso previsto (público, con posibles anuncios), se registra una ADR nueva para sustituir el modelo y la prueba se queda solo con Basic Pitch.

## Alternativas consideradas
- Dejar que el paquete descargue el checkpoint: más simple, pero sin integridad y dependiente de `wget`.
- Versionar el checkpoint en el repositorio: descartado; pesa unos 165 MB y los modelos nunca van a git.

## Consecuencias
- Un paso manual más en la VPS (documentado en el runbook), a cambio de una descarga verificable y reproducible.
- El hash fijado en el repositorio se vuelve la referencia de integridad del modelo.
- Pendiente de verificar: licencia del checkpoint y coherencia con el aviso de `NOTICE`.

## Actualización 2026-11-16
Kevin comprobó en Zenodo que el checkpoint se publica bajo **CC BY 4.0**, no Apache 2.0 como decía el registro. Es una licencia permisiva que permite uso comercial y anuncios, con la condición de atribuir (autores, enlace a la licencia e indicar cambios). No bloquea el uso previsto, pero corrige D-12: la licencia del checkpoint es CC BY 4.0 y el aviso queda en `NOTICE`. La app mostrará la atribución en su pantalla de créditos. Pendiente: contrastar el MD5 de Zenodo (`22b961b77c1878239fec963362097045`) con el archivo de la VPS y fijar el SHA-256.
