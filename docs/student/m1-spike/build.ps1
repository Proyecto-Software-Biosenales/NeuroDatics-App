# M1 spike build: freeze the harness (real neurodatics code) with PyInstaller 6, onedir.
# Uses the isolated build-venv only. Nothing under backend/ or frontend/ is modified.
$ErrorActionPreference = 'Stop'
$m1 = $PSScriptRoot
$repo = (Resolve-Path "$m1\..\..").Path
$py = "$m1\build-venv\Scripts\python.exe"
$backend = "$repo\backend"

& $py -m PyInstaller --noconfirm --clean --onedir --name neurodatics-m1 `
    --distpath "$m1\dist" --workpath "$m1\build-work" --specpath "$m1\spec" `
    --paths "$backend\src" --paths "$m1\src" `
    --add-data "$backend\migrations;migrations" `
    --add-data "$backend\src\neurodatics\modules\reports\application\assets;neurodatics/modules/reports/application/assets" `
    --add-data "$backend\src\neurodatics\modules\reports\infrastructure\templates;neurodatics/modules/reports/infrastructure/templates" `
    --hidden-import logging.config `
    --hidden-import matplotlib.backends.backend_svg `
    --hidden-import matplotlib.backends.backend_agg `
    --hidden-import sqlalchemy.dialects.postgresql.psycopg `
    --collect-submodules alembic `
    --collect-submodules psycopg `
    --collect-all psycopg_binary `
    --collect-submodules uvicorn `
    --collect-submodules jose `
    --collect-all typst `
    --exclude-module tkinter --exclude-module IPython --exclude-module pytest `
    "$m1\src\m1_entry.py"
"pyinstaller exit code: $LASTEXITCODE"
