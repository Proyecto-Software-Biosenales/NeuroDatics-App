# NeuroDatics-App

## Description

Plataforma profesional para el análisis de bioseñales en neuromarketing. 

## Fast start

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build de producción
npm run build
```

Abrir en navegador: `http://localhost:5173`

## Stack 

- **React 19** + **Vite 8**
- **TypeScript 5.9** 
- **TailwindCSS v4** 
- **React Router DOM v7**
- **Fuente:** Poppins

## Structure

```
src/
├── app/                    # App-level setup (router, store, providers)
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
│
├── pages/                  # Route-level components (thin, mostly composition)
│   ├── Dashboard/
│   └── Profile/
│
├── features/               # Self-contained business domains ← core of modularity
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── index.ts        # Public API — only export what others need
│   └── notifications/
│
├── shared/                 # Truly reusable, domain-agnostic code
│   ├── components/         # Button, Modal, Input...
│   ├── hooks/              # useDebounce, useLocalStorage...
│   ├── utils/              # formatDate, slugify...
│   └── types/
│
├── assets/                 # Static files
└── styles/ 
```