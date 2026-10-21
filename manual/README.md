# Manual de usuario

El manual es [manual_usuario_neurodatics.md](manual_usuario_neurodatics.md). Las capturas están en
`assets/screenshots/` y el PDF no se guarda en git: se genera y se entrega como adjunto.

## Capturas

Las toma Playwright sobre la interfaz con la API simulada y datos sintéticos, sin servidor ni cuenta de Google:

```powershell
cd frontend
npm run capture:manual
```

Sobrescribe las imágenes de `manual/assets/screenshots/`. Si el puerto 3100 está ocupado, define
`PLAYWRIGHT_PORT` antes de ejecutarlo.

## PDF

`build_manual_pdf.py` convierte el manual en PDF con `reportlab` (no forma parte de las dependencias del
proyecto) y usa las fuentes Segoe UI de Windows. Instálalo en un entorno aparte, no en `.venv`:

```powershell
python -m venv output\manual-venv
output\manual-venv\Scripts\python.exe -m pip install reportlab
output\manual-venv\Scripts\python.exe manual\build_manual_pdf.py
```

El resultado queda en `output/pdf/manual_usuario_neurodatics.pdf`. Si cambian los títulos de las secciones del
manual, actualiza también la lista `toc_entries` del script.
