# AUTH_GOOGLE.md

## Estado Actual De Autenticacion

La autenticacion se realiza con Google OAuth en frontend y emision local de JWT en backend.

## Componentes Clave

Frontend:

- lib/providers/customAuthProvider.tsx: construye URL OAuth y redirige a Google.
- features/auth/AuthCallback.tsx: recibe code y lo intercambia con backend.
- lib/auth/sessionStore.ts: persiste user, accessToken y refreshToken en localStorage.
- lib/api/apiFetch.ts: agrega Bearer token y refresca access token automaticamente.

Backend:

- modules/auth/api/routes.py
  - POST /api/auth/google/authorize
  - POST /api/auth/refresh
- config/security.py
  - create_access_token
  - create_refresh_token
  - verify_jwt_token
- api/deps.py
  - get_current_user para endpoints protegidos

## Flujo De Login

1. Usuario hace click en iniciar sesion con Google.
2. Frontend redirige a Google OAuth.
3. Google vuelve a /authorize con code.
4. Frontend llama a POST /api/auth/google/authorize.
5. Backend valida con Google y genera JWT locales.
6. Frontend guarda sesion y navega al dashboard.

## Flujo De Refresh Token

1. Request protegida falla con 401 por token expirado.
2. apiFetch ejecuta POST /api/auth/refresh con refresh_token.
3. Si refresca correctamente, reintenta la request original.
4. Si falla refresh, redirige a /login.

## Endpoints Protegidos

Requieren Authorization: Bearer access_token valido:

- /api/projects/*
- /api/projects/{id}/participants
- /api/projects/{id}/scenaries
- /api/projects/{id}/aois

## Consideraciones De Seguridad

- No commitear secretos de OAuth o JWT.
- Cambiar AUTH_JWT_SECRET en entornos reales.
- Restringir CORS en produccion.
- En produccion, preferir almacenamiento mas seguro para tokens y proteger contra XSS.
