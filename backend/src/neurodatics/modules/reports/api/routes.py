from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ....api.deps import get_current_user, get_db
from ..application.services.executive_report_service import ExecutiveReportService
from .schemas import ExecutiveReportRequest

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/executive")
async def generate_executive_report(
    request: ExecutiveReportRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ExecutiveReportService(db)
    pdf_bytes, filename = await service.generate(request, current_user)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
