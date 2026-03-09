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

## Structure Front

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


## Structure Back

```
backend/
  README.md
  pyproject.toml
  .env.example
  .gitignore

  scripts/
    dev.sh
    lint.sh
    test.sh
    seed.sh

  migrations/
    versions/

  tests/
    unit/
    integration/
    e2e/

  src/
    neurodatics/
      main.py
      config/
        settings.py
        logging.py
        security.py

      api/
        deps.py
        router.py
        middlewares.py

      shared/
        exceptions/
          base.py
          domain.py
          http.py
        utils/
          ids.py
          dates.py
          files.py
        schemas/
          common.py
        constants/
          sensors.py
          statuses.py

      infra/
        db/
          base.py
          session.py
          models/
          repositories/
        storage/
          r2_client.py
        queue/
          broker.py
        cache/
          redis_client.py
        observability/
          metrics.py
          tracing.py

      modules/
        projects/
          api/
            routes.py
            schemas.py
          application/
            dto.py
            use_cases/
              create_project.py
              list_projects.py
              delete_project.py
          domain/
            entities.py
            value_objects.py
            repository.py
            services.py
          infrastructure/
            repository_impl.py
            mappers.py

        uploads/
          api/
            routes.py
            schemas.py
          application/
            dto.py
            use_cases/
              upload_experiment_folder.py
              validate_upload.py
          domain/
            entities.py
            repository.py
            services.py
          infrastructure/
            repository_impl.py
            r2_storage_adapter.py

        processing/
          api/
            routes.py
            schemas.py
          application/
            dto.py
            use_cases/
              enqueue_processing.py
              get_job_status.py
          domain/
            entities.py
            repository.py
            services.py
          infrastructure/
            repository_impl.py
            parquet_adapter.py

        reports/
          api/
            routes.py
            schemas.py
          application/
            dto.py
            use_cases/
              create_report_job.py
              list_reports.py
          domain/
            entities.py
            repository.py
            services.py
          infrastructure/
            repository_impl.py
            pdf_adapter.py

        participants/
          api/
            routes.py
            schemas.py
          application/
            dto.py
            use_cases/
          domain/
            entities.py
            repository.py
          infrastructure/
            repository_impl.py

      workers/
        entrypoint.py
        tasks/
          process_experiment_folder.py
          generate_report_pdf.py
          extract_metrics.py
        pipelines/
          csv_to_parquet.py
          validations.py
          feature_extraction.py
          report_builder.py
```