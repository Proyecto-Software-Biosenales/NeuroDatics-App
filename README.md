# NeuroDatics-App


# Structure

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