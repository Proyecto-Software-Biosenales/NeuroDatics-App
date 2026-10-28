# Network edition only (Google sign-in, Google Drive). NeuroDatics ships only the local edition,
# which never imports this module; it is kept for self-hosting: docs/tecnica/alojamiento-en-red.md.

"""Administración de la cuenta de Google Drive compartida, solo desde el servidor.

Quien usa NeuroDatics no elige ni ve la cuenta que guarda los archivos: la definen los
administradores con este comando dentro del contenedor del backend.

    python -m neurodatics.modules.integrations.google_drive.admin estado
    python -m neurodatics.modules.integrations.google_drive.admin conectar

`conectar` imprime el enlace de autorización de Google. Se abre en un navegador con la
sesión de la cuenta que guardará los archivos; al aceptar, Google vuelve a
`/api/integrations/google-drive/callback` y la conexión queda guardada.
"""

import argparse
import asyncio
import sys
from typing import Optional

from ....config.settings import settings
from .application.service import GOOGLE_DRIVE_PROVIDER, GoogleDriveIntegrationService
from .infrastructure.repository import SystemIntegrationRepository


async def _read_integration() -> Optional[dict]:
    from ....infra.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        return await SystemIntegrationRepository(session).get_by_provider(GOOGLE_DRIVE_PROVIDER)


def _describe(integration: Optional[dict]) -> str:
    if not integration or not integration.get("refresh_token"):
        return "Google Drive no está conectado."
    account = integration.get("account_email") or "cuenta sin correo registrado"
    updated = integration.get("updated_at")
    when = f" (última autorización: {updated:%Y-%m-%d %H:%M} UTC)" if updated else ""
    return f"Cuenta de almacenamiento: {account}{when}."


def _authorization_url() -> str:
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise SystemExit(
            "Falta GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET en la configuración del servidor."
        )
    # Building the URL only signs a `state`; it never touches the database.
    return GoogleDriveIntegrationService(repository=None).build_authorization_url()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m neurodatics.modules.integrations.google_drive.admin",
        description="Cuenta de Google Drive compartida de NeuroDatics.",
    )
    parser.add_argument("accion", choices=["estado", "conectar"], nargs="?", default="estado")
    args = parser.parse_args(argv)

    if settings.is_local:
        raise SystemExit("La edición local guarda los archivos en el equipo; no usa Google Drive.")

    print(_describe(asyncio.run(_read_integration())))
    if args.accion == "conectar":
        minutes = max(1, int(settings.google_drive_oauth_state_ttl_seconds) // 60)
        print(
            "\nAbre este enlace con la sesión de Google de la cuenta que guardará los archivos "
            f"(caduca en {minutes} minutos). Si ya hay una cuenta, la sustituye:\n"
        )
        print(_authorization_url())
    return 0


if __name__ == "__main__":
    sys.exit(main())
