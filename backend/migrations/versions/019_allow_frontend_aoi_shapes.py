"""Allow frontend AOI shape types.

Revision ID: 019
Revises: 018
Create Date: 2026-07-18 17:15:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


ALLOWED_SHAPES = ("rect", "circle", "polygon")
PREVIOUS_ALLOWED_SHAPES = ("rect", "polygon")


def _values_sql(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    allowed_values_sql = _values_sql(ALLOWED_SHAPES)

    op.execute(
        f"""
        DO $$
        DECLARE
            rec RECORD;
        BEGIN
            -- Normalize legacy labels before tightening the canonical constraint.
            UPDATE aois
            SET shape_type = lower(shape_type)
            WHERE shape_type IS NOT NULL;

            UPDATE aois
            SET shape_type = 'rect'
            WHERE shape_type = 'rectangle';

            UPDATE aois
            SET shape_type = 'polygon'
            WHERE shape_type IN ('silueta', 'silhouette');

            UPDATE aois
            SET shape_type = 'rect'
            WHERE shape_type IS NULL
               OR shape_type NOT IN ({allowed_values_sql});

            FOR rec IN
                SELECT con.conname AS name
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'aois'
                  AND nsp.nspname = current_schema()
                  AND con.contype = 'c'
                  AND (
                      con.conname = 'aoi_shape_allowed'
                      OR pg_get_constraintdef(con.oid) ILIKE '%shape_type%'
                  )
            LOOP
                EXECUTE format('ALTER TABLE aois DROP CONSTRAINT %I', rec.name);
            END LOOP;

            ALTER TABLE aois
            ADD CONSTRAINT aoi_shape_allowed
            CHECK (shape_type IN ({allowed_values_sql}));
        END $$;
        """
    )


def downgrade() -> None:
    previous_values_sql = _values_sql(PREVIOUS_ALLOWED_SHAPES)

    op.execute(
        f"""
        DO $$
        DECLARE
            rec RECORD;
        BEGIN
            UPDATE aois
            SET shape_type = 'rect'
            WHERE shape_type = 'circle'
               OR shape_type IS NULL
               OR shape_type NOT IN ({previous_values_sql});

            FOR rec IN
                SELECT con.conname AS name
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'aois'
                  AND nsp.nspname = current_schema()
                  AND con.contype = 'c'
                  AND (
                      con.conname = 'aoi_shape_allowed'
                      OR pg_get_constraintdef(con.oid) ILIKE '%shape_type%'
                  )
            LOOP
                EXECUTE format('ALTER TABLE aois DROP CONSTRAINT %I', rec.name);
            END LOOP;

            ALTER TABLE aois
            ADD CONSTRAINT aoi_shape_allowed
            CHECK (shape_type IN ({previous_values_sql}));
        END $$;
        """
    )
