"""Bound and authenticate ZIP requests before FastAPI parses multipart data."""

from fastapi import HTTPException, Request
from fastapi.routing import APIRoute
from starlette.formparsers import MultiPartException, MultiPartParser

from ....config.security import get_current_user_id, security
from ..application.services.upload_throttle import (
    UploadRejected,
    upload_admission_control,
)
from ..application.services.zip_validation_service import ZipValidationService


class BoundedUploadParser(MultiPartParser):
    MAX_FIELD_BYTES = 1024 * 1024
    MAX_HEADER_BYTES = 16 * 1024

    def on_part_begin(self):
        self._part_header_bytes = 0
        super().on_part_begin()

    def on_part_data(self, data, start, end):
        if self._current_part.file is None:
            if len(self._current_part.data) + end - start > self.MAX_FIELD_BYTES:
                raise MultiPartException("Upload form field is too large")
        super().on_part_data(data, start, end)

    def _count_header(self, size):
        self._part_header_bytes += size
        if self._part_header_bytes > self.MAX_HEADER_BYTES:
            raise MultiPartException("Upload part headers are too large")

    def on_header_field(self, data, start, end):
        self._count_header(end - start)
        super().on_header_field(data, start, end)

    def on_header_value(self, data, start, end):
        self._count_header(end - start)
        super().on_header_value(data, start, end)

    async def parse(self):
        try:
            return await super().parse()
        except BaseException:
            # The pinned Starlette version closes these only for
            # MultiPartException, leaving disconnect/cancellation paths open.
            for file in self._files_to_close_on_error:
                file.close()
            raise


class ProjectUploadRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        if not (self.path.endswith("/files/experiment-zip") and "POST" in self.methods):
            return original

        async def guarded(request: Request):
            user_id = await get_current_user_id(await security(request))
            limit = ZipValidationService.get_max_file_size_bytes() + 2 * 1024 * 1024
            length = request.headers.get("content-length")
            if length is not None:
                try:
                    declared = int(length)
                except ValueError as exc:
                    raise HTTPException(400, "Invalid Content-Length") from exc
                if declared < 0:
                    raise HTTPException(400, "Invalid Content-Length")
                if declared > limit:
                    raise HTTPException(413, "Upload request is too large")
            if (
                request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                != "multipart/form-data"
            ):
                raise HTTPException(415, "Expected multipart/form-data")

            received = 0

            async def bounded_stream():
                nonlocal received
                async for chunk in request.stream():
                    received += len(chunk)
                    if received > limit:
                        raise MultiPartException("Upload request is too large")
                    yield chunk

            try:
                with upload_admission_control.slot(user_id):
                    parser = BoundedUploadParser(
                        request.headers, bounded_stream(), max_files=1, max_fields=20
                    )
                    try:
                        form = await parser.parse()
                    except MultiPartException as exc:
                        raise HTTPException(
                            413 if received > limit else 400, exc.message
                        ) from exc
                    try:
                        names = [name for name, _ in form.multi_items()]
                        if len(set(names)) != len(names):
                            raise HTTPException(400, "Duplicate upload form fields")
                        # Let FastAPI validate the already bounded form and run
                        # dependencies without consuming or copying it again.
                        request._form = form
                        return await original(request)
                    finally:
                        await form.close()
            except UploadRejected as exc:
                raise HTTPException(
                    429, str(exc), headers={"Retry-After": str(exc.retry_after_seconds)}
                ) from exc

        return guarded
