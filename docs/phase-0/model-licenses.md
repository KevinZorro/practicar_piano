# Licencias de los modelos (Fase 0)

Estado: **sin verificar por completo**. Se completa durante la prueba en la VPS (ver ADR 0013).

| Componente | Qué dice el registro | Qué se comprobó | Pendiente |
| --- | --- | --- | --- |
| Basic Pitch (código y modelo ONNX/TF incluidos en el paquete) | Apache 2.0 | Paquete `basic-pitch` 0.4.0 en PyPI, repositorio de Spotify | Confirmar el texto de la licencia en el repositorio |
| `piano_transcription_inference` (código) | Apache 2.0 | Metadatos de PyPI 0.0.6: clasificador **MIT** | Revisar el LICENSE del repositorio y corregir `NOTICE` |
| Checkpoint preentrenado de ByteDance (Zenodo, registro 4034264) | Apache 2.0 (según Replicate) | **No verificado**: Zenodo no es accesible desde el entorno de desarrollo | Leer la licencia en la página del registro de Zenodo antes de usarlo en público |

Regla: si cualquiera resulta no permisiva o limita el uso previsto, se avisa a Kevin y se escribe una ADR antes de continuar.
