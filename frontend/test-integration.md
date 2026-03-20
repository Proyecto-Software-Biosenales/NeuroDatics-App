# Test de Integración - Wizard de Creación de Proyectos

## ✅ Checklist de Funcionalidades Implementadas

### **Paso 1: Selección de ZIP**
- [x] Input file oculto con `accept=".zip,application/zip"`
- [x] Drag & drop funcional
- [x] Validación de tipo de archivo (.zip)
- [x] Validación de tamaño (máximo 100MB)
- [x] Mostrar nombre del archivo seleccionado
- [x] Botón para limpiar archivo seleccionado
- [x] Manejo de errores con mensajes claros
- [x] `canGoNext()` requiere `projectName` y `experimentZip`

### **Paso 2-4: Flujo del Wizard**
- [x] Navegación entre pasos
- [x] Validación en cada paso
- [x] Datos persistidos en `formData`

### **Guardado del Proyecto**
- [x] Estado `isSaving` para mostrar "Guardando..."
- [x] Botones deshabilitados durante guardado
- [x] Manejo de errores con `saveError`
- [x] Rollback automático si falla upload de ZIP
- [x] Normalización de datos de participantes
- [x] Llamadas secuenciales a la API:
  1. `POST /api/projects`
  2. `POST /api/projects/{id}/files/experiment-zip`
  3. `PUT /api/projects/{id}/sensors`
  4. `PUT /api/projects/{id}/participants`
  5. `POST /api/projects/{id}/finalize`

### **UX/UI**
- [x] Error mostrado en el modal sin cerrarlo
- [x] Prevención de doble submit
- [x] Feedback visual durante guardado
- [x] Reset del wizard al completar

## 🧪 Pasos para Probar

### **1. Verificar Backend**
```bash
cd backend
python simple_server.py
# Verificar que esté corriendo en http://localhost:8000
# Abrir http://localhost:8000/docs para ver Swagger
```

### **2. Verificar Frontend**
```bash
cd frontend
npm run dev
# Abrir http://localhost:3000
```

### **3. Probar el Wizard**

1. **Ir a la página de proyectos**
2. **Hacer clic en "Crear nuevo proyecto"**
3. **Paso 1:**
   - Ingresar nombre del proyecto
   - Probar drag & drop con archivo no-ZIP (debe mostrar error)
   - Seleccionar archivo .zip válido
   - Verificar que se muestre el nombre del archivo
   - Verificar que "Siguiente" se habilite
4. **Paso 2:**
   - Seleccionar al menos un sensor
   - Continuar al siguiente paso
5. **Paso 3:**
   - Verificar que hay participantes pre-cargados
   - Modificar edad y sexo de algunos participantes
   - Continuar al siguiente paso
6. **Paso 4:**
   - Hacer clic en "Guardar proyecto"
   - Verificar que el botón cambie a "Guardando..."
   - Verificar que se deshabiliten todos los botones
   - Esperar a que se complete el guardado
   - Verificar que el modal se cierre
   - Verificar que el proyecto aparezca en la lista

### **4. Probar Casos de Error**

1. **Error de red:**
   - Detener el backend
   - Intentar guardar proyecto
   - Verificar que se muestre error sin cerrar modal

2. **Archivo muy grande:**
   - Seleccionar archivo ZIP > 100MB
   - Verificar mensaje de error

3. **Archivo no-ZIP:**
   - Intentar seleccionar archivo .txt o .jpg
   - Verificar mensaje de error

## 🔧 Configuración Requerida

### **Variables de Entorno (Frontend)**
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### **Variables de Entorno (Backend)**
```env
DATABASE_URL=sqlite+aiosqlite:///./neurodatics.db
SUPABASE_JWKS_URL=https://your-project.supabase.co/.well-known/jwks.json
SUPABASE_JWT_ISSUER=https://your-project.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GDRIVE_FOLDER_ID=development-folder-id
APP_NAME=NeuroDatics API
DEBUG=true
```

## 📊 Estructura de Datos

### **Participantes (sin PII):**
```json
{
  "participants": [
    {
      "participant_code": "1000557085",
      "age": 25,
      "sex": "male"
    }
  ]
}
```

### **Sensores:**
```json
{
  "sensors": ["EEG", "GSR", "EyeTracker"]
}
```

## ✅ Criterios de Aceptación Cumplidos

1. ✅ **En Paso 1 puedo seleccionar o dropear un .zip y queda guardado en formData.experimentZip**
2. ✅ **Al guardar, el frontend crea el proyecto en backend, sube zip a Drive, guarda sensores y participantes**
3. ✅ **El botón muestra estado "Guardando..." y no permite doble submit**
4. ✅ **Si hay error, se muestra saveError sin cerrar el modal**
5. ✅ **No quedan proyectos huérfanos si falla el upload del zip (rollback implementado)**
6. ✅ **Integración completa con endpoints reales del backend**