---
paths:
  - "backend/**/*.py"
---
# Python (backend)
- Type hints en todo, mypy estricto. Config con pydantic-settings/dataclasses, nunca dicts sueltos.
- Dependencias de dirección: `infrastructure` -> `application` -> `domain`. El dominio no importa frameworks ni yt-dlp ni modelos.
- Efectos (red, disco, subprocesos, reloj) solo en `infrastructure`; los casos de uso reciben puertos por constructor.
- Sin `print`: usa `logging`. Nunca registres URLs de YouTube (ver `docs/adr/0007-datos-y-cuentas.md`).
- Rutas y secretos salen de variables de entorno o argumentos, nunca hardcodeados.
- Pruebas: unitarias sin red; marca `integration`, `network` y `slow`. Ruff + mypy + `pytest -q -x`.
