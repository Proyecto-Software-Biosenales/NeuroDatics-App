# Estructura de Almacenamiento de Archivos ZIP - NeuroDatics Backend

## 1. UBICACIÓN DE ALMACENAMIENTO

### 🗂️ Almacenamiento Principal: Google Drive
- **Ubicación predeterminada**: Google Drive (especificado en configuración)
- **Configuración**: `backend/src/neurodatics/config/settings.py`
  - `storage_provider`: "gdrive" (por defecto)
  - `project_zip_max_size_mb`: 500 MB máximo
  - `ingestion_save_original_zip`: True (guarda el ZIP original)
  - `gdrive_service_account_json`: Credenciales de servicio
  - `google_application_credentials`: Ruta a credenciales

### 📁 Almacenamiento Local (Mínimo)
- **Ruta**: `backend/data/`
- **Contenido actual**: Solo `auth_users.json` (datos de autenticación local)
- **Nota**: No se guardan archivos ZIP en local; se extraen en memoria a carpeta temporal

### 🗂️ Carpeta Temporal de Extracción
- **Patrón**: `tempfile.TemporaryDirectory(prefix="neurodatics-ingestion-")`
- **Estructura**: 
  ```
  /tmp/neurodatics-ingestion-XXXXX/
  ├── payload.zip          (ZIP original)
  └── extracted/           (archivos extraídos temporalmente)
      ├── carpeta1/
      ├── carpeta2/
      └── archivo.csv
  ```
- **Limpieza**: Automática (context manager de Python)

---

## 2. ESTRUCTURA EN GOOGLE DRIVE

### Jerarquía de Carpetas
```
Google Drive (raíz configurada)
└── [Proyecto] (carpeta raíz por proyecto)
    ├── experiment.zip        (ZIP original - si ingestion_save_original_zip=True)
    ├── [carpeta1]           (estructura del ZIP replicada)
    │   ├── archivo.csv
    │   ├── imagen.jpg
    │   └── video.mp4
    ├── [carpeta2]
    │   └── datos.csv
    └── [carpeta_N]
```

### Creación de Carpeta Raíz
- **Cuándo**: Primera subida del ZIP al proyecto
- **Nombre**: Nombre del proyecto
- **Método**: `gdrive_client.create_folder(name=project.name)`
- **Almacenado en**: `Project.drive_root_folder_id`

### Carpetas de Estructura del ZIP
- **Creación**: Se crean automáticamente siguiendo la estructura del ZIP
- **Método**: `gdrive_client.create_folder(name=folder_part, parent_id=parent_folder_id)`
- **Cache**: Almacenado en `folder_cache` durante la ingesta para evitar duplicados

---

## 3. MODELOS/SCHEMAS DE BASE DE DATOS

### 📊 Tabla: `projects`
```sql
id (UUID) - Clave primaria
owner_id (UUID) - FK a auth.users
name (VARCHAR 255) - Nombre del proyecto
description (TEXT) - Descripción
status (ENUM) - draft | active | archived
ingestion_status (VARCHAR 20) - PENDING | PROCESSING | READY | FAILED
ingestion_error (TEXT) - Mensaje de error si falló
last_ingested_at (TIMESTAMP) - Última ingesta exitosa
storage_provider (VARCHAR 20) - "gdrive" | "r2"
drive_root_folder_id (VARCHAR 255) - ID de carpeta raíz en Google Drive
drive_root_folder_name (VARCHAR 255) - Nombre de carpeta raíz
drive_root_folder_url (VARCHAR 500) - URL web de la carpeta en Drive
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Relaciones**:
- `files` → ProjectFile (cascada delete)
- `sensors` → ProjectSensor (cascada delete)
- `participants` → Participant (cascada delete)
- `scenaries` → Scenaries (cascada delete)

### 📊 Tabla: `project_files`
```sql
id (UUID) - Clave primaria
project_id (UUID) - FK a projects
source_zip_id (UUID) - FK a project_files (ZIP fuente si fue extraído)
kind (VARCHAR 50) - Tipo de archivo (constraint CHECK)
storage_provider (VARCHAR 20) - "gdrive" | "r2"
external_id (VARCHAR 255) - ID del archivo en Google Drive o R2
drive_parent_external_id (VARCHAR 255) - ID de carpeta padre en Google Drive
filename (VARCHAR 255) - Nombre actual del archivo
original_filename (VARCHAR 255) - Nombre original del usuario
source_entry_path (VARCHAR 1024) - Ruta dentro del ZIP (ej: carpeta1/archivo.csv)
mime_type (VARCHAR 100) - application/zip, image/jpeg, etc.
extension (VARCHAR 20) - .zip, .csv, .jpg, .mp4, etc.
size_bytes (INTEGER) - Tamaño en bytes
checksum_sha256 (VARCHAR 64) - Hash SHA256 del archivo

-- Google Drive URLs
drive_web_view_link (VARCHAR 500) - Link para ver en Drive
drive_download_link (VARCHAR 500) - Link para descargar

-- Validación y procesamiento
validation_status (VARCHAR 20) - "valid" | "invalid"
validation_errors (JSON) - Array de errores de validación
processing_status (VARCHAR 20) - "processing" | "processed" | "failed"
processing_errors (JSON) - Array de errores de procesamiento
processed_at (TIMESTAMP) - Cuándo se procesó
file_metadata (JSON) - Metadatos customizados
  - source_entry_path
  - csv_processing (si es CSV)

-- Información del ZIP
zip_manifest (JSON) - Estructura del ZIP procesado
  - entries[]:
    - source_entry_path
    - kind
    - size_bytes
entry_count (INTEGER) - Total de entradas en el ZIP
root_folder_name (VARCHAR 255) - Nombre de carpeta raíz del ZIP

-- Soft delete
deleted_at (TIMESTAMP) - Para reemplazar ZIPs

created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Constraint**:
```sql
CHECK (kind IN ('experiment_zip', 'scenario_image', 'scenario_video', 
                'raw_csv', 'derived_csv', 'report_pdf', 'other_asset'))
```

**Relación**:
- `project` ← Project (back_populates="files")

### 📊 Tabla: `scenaries` (Referencia a archivos)
```sql
id (UUID) - Clave primaria
project_id (UUID) - FK a projects
file_id (UUID) - FK a project_files (added in migration 006)
...otros campos...
```

---

## 4. TIPOS DE ARCHIVOS Y CLASIFICACIÓN

### Clasificación por Extensión (Inferencia Automática)
```python
{
    ".jpg": "scenario_image",
    ".jpeg": "scenario_image",
    ".png": "scenario_image",
    ".gif": "scenario_image",
    ".bmp": "scenario_image",
    ".webp": "scenario_image",
    ".tif": "scenario_image",
    ".tiff": "scenario_image",
    ".svg": "scenario_image",
    
    ".mp4": "scenario_video",
    ".avi": "scenario_video",
    ".mov": "scenario_video",
    ".mkv": "scenario_video",
    ".webm": "scenario_video",
    ".m4v": "scenario_video",
    
    ".csv": "raw_csv",
    ".pdf": "report_pdf",
    # todo lo demás → "other_asset"
}
```

### Tipos `kind` Permitidos
1. **`experiment_zip`** - ZIP original cargado
2. **`scenario_image`** - Imágenes (jpg, png, gif, etc.)
3. **`scenario_video`** - Videos (mp4, avi, mov, etc.)
4. **`raw_csv`** - Datos CSV brutos
5. **`derived_csv`** - CSV procesados/derivados
6. **`report_pdf`** - Reportes en PDF
7. **`other_asset`** - Otros archivos

---

## 5. ENDPOINTS DISPONIBLES

### 📤 POST - Subir ZIP y ejecutar ingesta completa
```
POST /projects/{project_id}/files/experiment-zip

Headers:
  Authorization: Bearer <jwt_token>
  Content-Type: multipart/form-data

Body:
  file: <archivo.zip> (multipart file)

Response: UploadedProjectZipSummaryResponse {
  project_id: UUID
  ingestion_status: "READY" | "PROCESSING" | "FAILED"
  drive_root_folder_id: string
  drive_root_folder_name: string
  drive_root_folder_url: string
  zip_saved: boolean
  zip_file: UploadedProjectZipResponse | null
  counts: {
    folders_created: int
    files_uploaded: int
    images: int
    videos: int
    csv: int
    other: int
    scenaries_created: int
  }
  files: UploadedProjectZipResponse[]
  csv_processing: {
    detected: int
    processed: int
    failed: int
  }
  manifest: {
    total_detected: int
    images: int
    videos: int
    csv: int
    other: int
  }
}
```

**Validaciones previas**:
- Archivo debe tener extensión `.zip`
- MIME type debe ser `application/zip` o `application/x-zip-compressed`
- Tamaño máximo: 500 MB (configurable)
- ZIP no puede estar vacío
- ZIP no puede estar corrupto

### 🗑️ DELETE - Eliminar ZIP y archivos extraídos
```
DELETE /projects/{project_id}/files/experiment-zip

Headers:
  Authorization: Bearer <jwt_token>

Response: {
  message: "Experiment zip file deleted successfully"
}

Status: 404 si el ZIP no existe
```

---

## 6. ARCHIVOS CLAVE DE CONFIGURACIÓN

### `backend/src/neurodatics/config/settings.py`
```python
project_zip_max_size_mb: int = 500              # Límite ZIP
ingestion_save_original_zip: bool = True        # Guardar ZIP original
gdrive_service_account_json: Optional[str]      # Credenciales Drive
google_application_credentials: Optional[str]   # Ruta a credenciales
gdrive_folder_id: Optional[str]                 # Carpeta raíz en Drive
auth_user_store_path: str = "data/auth_users.json"
```

---

## 7. PROCESO DE INGESTA (FLUJO)

```
1. POST /projects/{id}/files/experiment-zip
         ↓
2. Validación ZIP (ZipValidationService):
   - Verifica extensión .zip
   - Verifica MIME type
   - Verifica tamaño < 500MB
   - Valida integridad (testzip)
   - Analiza contenido
         ↓
3. Extracción temporal (ZipExtractionService):
   - Crea temp_dir con patrón "neurodatics-ingestion-"
   - Extrae archivos a memoria
   - Verifica rutas seguras (no ../ ni : ni absolutos)
         ↓
4. Crear carpeta raíz en Google Drive:
   - Si no existe: crea carpeta con nombre del proyecto
   - Guarda id en Project.drive_root_folder_id
         ↓
5. Guardar ZIP original (opcional):
   - Si ingestion_save_original_zip=True
   - Sube ZIP a Google Drive
   - Crea registro ProjectFile con kind="experiment_zip"
   - Crea source_zip_file_id para vincular archivos extraídos
         ↓
6. Procesar estructura de carpetas:
   - Recorre todas las carpetas del ZIP
   - Crea carpetas en Google Drive en paralelo
   - Mantiene cache para evitar duplicados
         ↓
7. Subir archivos individuales:
   - Para cada archivo en el ZIP
   - Detecta kind basado en extensión
   - Sube a Google Drive en carpeta correspondiente
   - Si es CSV: procesa y extrae metadatos
   - Crea registro ProjectFile en BD
         ↓
8. Crear Scenaries (si aplica):
   - Analiza CSVs para crear escenarios
   - Vincula archivos a escenarios
         ↓
9. Actualizar estado del proyecto:
   - ingestion_status = "READY"
   - last_ingested_at = ahora
   - drive_root_folder_id = guardado
         ↓
10. Cleanup temporal:
    - Elimina carpeta temporal automáticamente
    - Si error: rollback de cambios en BD
    - Si error: intenta eliminar archivos de Drive creados
```

---

## 8. MIGRACIONES RELACIONADAS

### `005_add_zip_validation_fields.py`
Agrega campos a `project_files`:
- `validation_status`, `validation_errors`
- `processing_status`, `processing_errors`
- `processed_at`

### `006_add_file_id_to_scenaries.py`
Agrega a `scenaries`:
- `file_id` (FK a `project_files`)

### `007_project_ingestion_real_files.py`
Agrega campos a ambas tablas:
- **projects**: `ingestion_status`, `ingestion_error`, `last_ingested_at`, 
  `storage_provider`, `drive_root_folder_id`, `drive_root_folder_name`, `drive_root_folder_url`
- **project_files**: `source_zip_id`, `drive_parent_external_id`, `source_entry_path`, 
  `extension`, `processing_errors`, `file_metadata`

### `010_fix_project_files_kind_constraint.py`
Constraint CHECK en `project_files.kind`:
```sql
CHECK (kind IN ('experiment_zip', 'scenario_image', 'scenario_video', 
                'raw_csv', 'derived_csv', 'report_pdf', 'other_asset'))
```

---

## 9. SERVICIOS Y CLASES CLAVE

### `ZipValidationService` (Validación)
```python
# Ubicación: backend/src/neurodatics/modules/projects/application/services/zip_validation_service.py

validate_upload()        # Valida antes de procesar
validate_zip_integrity() # Verifica integridad
validate_and_analyze()   # Análisis completo
infer_kind()             # Deduce tipo por extensión
infer_mime_type()        # Deduce MIME type
```

### `ZipExtractionService` (Extracción)
```python
# Ubicación: backend/src/neurodatics/modules/projects/application/services/zip_extraction_service.py

extract_to_temp()  # Context manager para extracción segura
```

### `UploadExperimentZipUseCase` (Orquestación)
```python
# Ubicación: backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py

execute()  # Ejecuta flujo completo de ingesta
```

### `GoogleDriveClient` (Infraestructura)
```python
# Ubicación: backend/src/neurodatics/infra/storage/gdrive_client.py

create_folder()            # Crea carpetas en Drive
find_child_folder_by_name()  # Busca carpetas existentes
upload_file()              # Sube archivos
delete_file()              # Elimina archivos/carpetas
```

---

## 10. CONFIGURACIÓN DE EJEMPLO (.env)

```env
# Google Drive
GDRIVE_SERVICE_ACCOUNT_JSON='{"type": "service_account", ...}'
# O
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Almacenamiento
INGESTION_SAVE_ORIGINAL_ZIP=true
PROJECT_ZIP_MAX_SIZE_MB=500

# Database
DATABASE_URL=postgresql://user:password@localhost/neurodatics

# Auth
AUTH_JWT_SECRET=your-secret-key
```

---

## 11. RESUMEN DE RUTAS Y UBICACIONES

| Concepto | Ubicación |
|----------|-----------|
| **Archivos ZIP** | Google Drive (`Project.drive_root_folder_id`) |
| **Datos locales** | `backend/data/` (solo auth_users.json) |
| **Extracción temporal** | Sistema temp directory (`neurodatics-ingestion-*`) |
| **Entidad projects** | Tabla: `projects` |
| **Entidad project_files** | Tabla: `project_files` |
| **Entidad scenaries** | Tabla: `scenaries` |
| **Validación** | `backend/src/neurodatics/modules/projects/application/services/zip_validation_service.py` |
| **Extracción** | `backend/src/neurodatics/modules/projects/application/services/zip_extraction_service.py` |
| **Use case** | `backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py` |
| **Endpoint** | `backend/src/neurodatics/modules/projects/api/routes.py` (POST /{id}/files/experiment-zip) |
| **Configuración** | `backend/src/neurodatics/config/settings.py` |
| **Google Drive** | `backend/src/neurodatics/infra/storage/gdrive_client.py` |


