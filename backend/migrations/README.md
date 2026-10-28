# Migraciones

Revisiones de Alembic en `versions/`, numeradas en orden (`NNN_descripcion.py`, con `revision` igual al número y
`down_revision` apuntando a la anterior).

- **Crear:** desde `backend`, `..\.venv\Scripts\python.exe -m alembic revision -m "descripcion"`; después renombra el
  archivo y su `revision` al número siguiente.
- **Aplicar:** `alembic upgrade head` con `DATABASE_URL` apuntando a la base. El contenedor del backend y el lanzador
  de la edición local lo hacen solos al iniciar.
- **Compatibilidad:** también corren sobre el PostgreSQL 16 embebido de la edición local, así que no uses
  extensiones que no vengan en su paquete (ver [CONTRIBUTING.md](../../CONTRIBUTING.md)).
