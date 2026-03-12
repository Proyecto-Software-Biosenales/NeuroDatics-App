# NeuroDatics-App

Plataforma para el análisis de bioseñales aplicada a neuromarketing.

## Quick start

-- Backend (Python): see [backend/README.md](backend/README.md) for setup and run instructions.

## Project structure

```
NeuroDatics-App
├─ README.md
├─ backend
│  ├─ .gitignore
│  ├─ README.md
│  ├─ migrations
│  │  ├─ README.md
│  │  └─ versions
│  │     └─ .gitkeep
│  ├─ pyproject.toml
│  ├─ scripts
│  │  ├─ dev.sh
│  │  ├─ lint.sh
│  │  ├─ seed.sh
│  │  └─ test.sh
│  ├─ src
│  │  └─ neurodatics
│  │     ├─ api
│  │     │  ├─ deps.py
│  │     │  ├─ middlewares.py
│  │     │  └─ router.py
│  │     ├─ config
│  │     │  ├─ logging.py
│  │     │  ├─ security.py
│  │     │  └─ settings.py
│  │     ├─ infra
│  │     │  ├─ cache
│  │     │  │  └─ redis_client.py
│  │     │  ├─ db
│  │     │  │  ├─ base.py
│  │     │  │  ├─ models
│  │     │  │  │  └─ .gitkeep
│  │     │  │  ├─ repositories
│  │     │  │  │  └─ .gitkeep
│  │     │  │  └─ session.py
│  │     │  ├─ observability
│  │     │  │  ├─ metrics.py
│  │     │  │  └─ tracing.py
│  │     │  ├─ queue
│  │     │  │  └─ broker.py
│  │     │  └─ storage
│  │     │     └─ r2_client.py
│  │     ├─ main.py
│  │     ├─ modules
│  │     │  ├─ participants
│  │     │  │  ├─ api
│  │     │  │  │  ├─ routes.py
│  │     │  │  │  └─ schemas.py
│  │     │  │  ├─ application
│  │     │  │  │  ├─ dto.py
│  │     │  │  │  └─ use_cases
│  │     │  │  │     └─ .gitkeep
│  │     │  │  ├─ domain
│  │     │  │  │  ├─ entities.py
│  │     │  │  │  └─ repository.py
│  │     │  │  └─ infrastructure
│  │     │  │     └─ repository_impl.py
│  │     │  ├─ processing
│  │     │  │  ├─ api
│  │     │  │  │  ├─ routes.py
│  │     │  │  │  └─ schemas.py
│  │     │  │  ├─ application
│  │     │  │  │  ├─ dto.py
│  │     │  │  │  └─ use_cases
│  │     │  │  │     ├─ enqueue_processing.py
│  │     │  │  │     └─ get_job_status.py
│  │     │  │  ├─ domain
│  │     │  │  │  ├─ entities.py
│  │     │  │  │  ├─ repository.py
│  │     │  │  │  └─ services.py
│  │     │  │  └─ infrastructure
│  │     │  │     ├─ parquet_adapter.py
│  │     │  │     └─ repository_impl.py
│  │     │  ├─ projects
│  │     │  │  ├─ api
│  │     │  │  │  ├─ routes.py
│  │     │  │  │  └─ schemas.py
│  │     │  │  ├─ application
│  │     │  │  │  ├─ dto.py
│  │     │  │  │  └─ use_cases
│  │     │  │  │     ├─ create_project.py
│  │     │  │  │     ├─ delete_project.py
│  │     │  │  │     └─ list_projects.py
│  │     │  │  ├─ domain
│  │     │  │  │  ├─ entities.py
│  │     │  │  │  ├─ repository.py
│  │     │  │  │  ├─ services.py
│  │     │  │  │  └─ value_objects.py
│  │     │  │  └─ infrastructure
│  │     │  │     ├─ mappers.py
│  │     │  │     └─ repository_impl.py
│  │     │  ├─ reports
│  │     │  │  ├─ api
│  │     │  │  │  ├─ routes.py
│  │     │  │  │  └─ schemas.py
│  │     │  │  ├─ application
│  │     │  │  │  ├─ dto.py
│  │     │  │  │  └─ use_cases
│  │     │  │  │     ├─ create_report_job.py
│  │     │  │  │     └─ list_reports.py
│  │     │  │  ├─ domain
│  │     │  │  │  ├─ entities.py
│  │     │  │  │  └─ repository.py
│  │     │  │  └─ infrastructure
│  │     │  │     ├─ pdf_adapter.py
│  │     │  │     └─ repository_impl.py
│  │     │  └─ uploads
│  │     │     ├─ api
│  │     │     │  ├─ routes.py
│  │     │     │  └─ schemas.py
│  │     │     ├─ application
│  │     │     │  ├─ dto.py
│  │     │     │  └─ use_cases
│  │     │     │     ├─ upload_experiment_folder.py
│  │     │     │     └─ validate_upload.py
│  │     │     ├─ domain
│  │     │     │  ├─ entities.py
│  │     │     │  └─ repository.py
│  │     │     └─ infrastructure
│  │     │        ├─ r2_storage_adapter.py
│  │     │        └─ repository_impl.py
│  │     ├─ shared
│  │     │  ├─ constants
│  │     │  │  ├─ sensors.py
│  │     │  │  └─ statuses.py
│  │     │  ├─ exceptions
│  │     │  │  ├─ base.py
│  │     │  │  ├─ domain.py
│  │     │  │  └─ http.py
│  │     │  ├─ schemas
│  │     │  │  └─ common.py
│  │     │  └─ utils
│  │     │     ├─ dates.py
│  │     │     ├─ files.py
│  │     │     └─ ids.py
│  │     └─ workers
│  │        ├─ entrypoint.py
│  │        └─ pipelines
│  │           ├─ csv_to_parquet.py
│  │           ├─ feature_extraction.py
│  │           ├─ report_builder.py
│  │           └─ validations.py
│  │        └─ tasks
│  │           ├─ extract_metrics.py
│  │           ├─ generate_report_pdf.py
│  │           └─ process_experiment_folder.py
│  └─ tests
│     ├─ e2e
│     │  └─ .gitkeep
│     ├─ integration
│     │  └─ .gitkeep
│     └─ unit
│        └─ .gitkeep
└─ frontend
	├─ .gitignore
	├─ .prettierignore
	├─ .prettierrc
	├─ README.md
	├─ app
	│  ├─ dashboard
	│  │  └─ page.tsx
	│  ├─ favicon.ico
	│  ├─ globals.css
	│  ├─ layout.tsx
	│  ├─ auth
	│  │  └─ callback
	│  │     └─ page.tsx
	│  ├─ login
	│  │  └─ page.tsx
	│  ├─ register
	│  │  └─ page.tsx
	│  ├─ page.tsx
	│  ├─ proyectos
	│  │  └─ page.tsx
	│  └─ reportes
	│     └─ page.tsx
	├─ components.json
	├─ components
	│  ├─ .gitkeep
	│  ├─ layout
	│  │  └─ NavBar.tsx
	│  ├─ theme-provider.tsx
	│  └─ ui
	│     ├─ Card.tsx
	│     ├─ Icon.tsx
	│     ├─ SelectOption.tsx
	│     ├─ SelectTrigger.tsx
	│     ├─ alert-dialog.tsx
	│     ├─ button.tsx
	│     ├─ dialog.tsx
	│     ├─ input.tsx
	│     ├─ item.tsx
	│     ├─ label.tsx
	│     ├─ progress.tsx
	│     ├─ separator.tsx
	│     ├─ sonner.tsx
	│     └─ checkbox.tsx
	├─ eslint.config.mjs
	├─ features
	│  ├─ auth
	│  │  ├─ AuthCallback.tsx
	│  │  ├─ LoginPage.tsx
	│  │  ├─ RegisterPage.tsx
	│  │  ├─ auth.ts
	│  │  └─ components
	│  │     ├─ AuthGuard.tsx
+  │  │     ├─ LoginForm.tsx
	│  │     └─ RegisterForm.tsx
	│  ├─ home
	│  │  ├─ components
	│  │  │  ├─ CTASection.tsx
	│  │  │  ├─ FeaturesSection.tsx
	│  │  │  ├─ Footer.tsx
	│  │  │  ├─ HeroSection.tsx
	│  │  │  └─ HowItWorksSection.tsx
	│  │  └─ index.ts
	│  └─ projects
	│     ├─ components
	│     │  ├─ DeleteProjectDialog.tsx
	│     │  ├─ EmptyState.tsx
	│     │  ├─ ProjectSelect.tsx
	│     │  ├─ ProjectSelectionCard.tsx
	│     │  ├─ ProjectsEmptyContainer.tsx
	│     │  ├─ ProjectsGrid.tsx
	│     │  ├─ SelectedProjectInfo.tsx
	│     │  └─ SensorBadge.tsx
		├─ create-project
		│  ├─ CreateProjectDialog.tsx
		│  ├─ CreateProjectStep1.tsx
		│  ├─ CreateProjectStep2.tsx
		│  ├─ CreateProjectStep3.tsx
		│  ├─ CreateProjectStep4.tsx
		│  ├─ index.ts
		│  ├─ types.ts
		│  ├─ useCreateProjectWizard.ts
		│  └─ useProjectsStorage.ts
	│     ├─ hooks
	│     │  └─ hooks.md
	│     ├─ select-project
	│     │  └─ useSelectedProject.ts
	│     └─ types.ts
	├─ features
	│  └─ reports
	│     ├─ components
	│     │  ├─ ExportOptionsCard.tsx
	│     │  ├─ ReportConfigurationCard.tsx
	│     │  ├─ ReportContentCard.tsx
	│     │  ├─ ReportPreview.tsx
	│     │  └─ ReportsEmptyContainer.tsx
	│     ├─ export-report-options
	│     │  └─ useExportOptions.ts
	│     ├─ hooks
	│     │  └─ hooks.md
	│     ├─ select-report-content
	│     │  └─ useReportContent.ts
	│     ├─ select-report-type
	│     │  └─ useReportType.ts
	│     ├─ select-sensors
	│     │  └─ useSelectedSensors.ts
	│     └─ types.ts
	├─ hooks
	│  └─ .gitkeep
	├─ lib
	│  ├─ .gitkeep
	│  ├─ providers
	│  │  └─ AuthProvider.tsx
	│  └─ utils
	│     ├─ supabase.ts
	│     └─ utils.ts
	├─ next.config.mjs
	├─ package-lock.json
	├─ package.json
	├─ postcss.config.mjs
	├─ public
	│  ├─ .gitkeep
	│  └─ assets
	│     ├─ NeuroDatics-logo.svg
	│     └─ react.svg
	├─ tsconfig.json
```
	├─ postcss.config.mjs
	├─ public
	│  ├─ .gitkeep
	│  └─ assets
	│     ├─ NeuroDatics-logo.svg
	│     └─ react.svg
	├─ tsconfig.json
```


