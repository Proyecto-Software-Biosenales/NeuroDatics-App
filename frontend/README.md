# NeuroDatics Frontend

Interfaz Next.js App Router, TypeScript y Tailwind CSS. La aplicación se inicia como parte del [stack Docker de la raíz](../README.md); no mantiene un arranque independiente del frontend.

## Responsabilidades

- Rutas de inicio de sesión, dashboard, proyectos, reportes y autorización.
- Componentes y flujos organizados por dominio en `features/`.
- Componentes reutilizables en `components/ui`.
- Cliente HTTP y proveedores de autenticación en `lib/`.

## Integración con el backend

- El navegador usa `/api` en el mismo origen.
- Next.js reenvía las solicitudes al backend interno mediante `NEXT_INTERNAL_API_BASE_URL`.
- El login principal usa Google OAuth; el callback es `/authorize`.

## Comprobaciones de código

Desde esta carpeta puedes ejecutar las comprobaciones de calidad cuando trabajes en la interfaz:

```bash
npm run lint
npm run typecheck
npm run build
```
