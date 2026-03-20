from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from ..domain.repository import scenariesRepository
from ..domain.entities import Scenaries, AOI


class SQLscenariesRepository(scenariesRepository):
    """SQLAlchemy implementation of scenariesRepository"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def upsert_scenaries(self, project_id: UUID, scenaries_data: List[dict]) -> List[Scenaries]:
        """Upsert scenaries"""
        scenaries = []
        
        for data in scenaries_data:
            name = data['name']
            scenaries_type = data['type']
            file_id = data.get('file_id')
            width = data.get('width')
            height = data.get('height')
            
            # Check if scenaries exists
            stmt = select(scenaries).where(
                scenaries.project_id == project_id,
                scenaries.name == name
            )
            result = await self.session.execute(stmt)
            scenaries = result.scalar_one_or_none()
            
            if scenaries:
                # Update existing scenaries
                scenaries.type = scenaries_type
                scenaries.file_id = file_id
                scenaries.width = width
                scenaries.height = height
            else:
                # Create new scenaries
                scenaries = scenaries(
                    project_id=project_id,
                    name=name,
                    type=scenaries_type,
                    file_id=file_id,
                    width=width,
                    height=height
                )
                self.session.add(scenaries)
            
            scenaries.append(scenaries)
        
        await self.session.commit()
        
        # Refresh scenaries
        for scenaries in scenaries:
            await self.session.refresh(scenaries)
        
        return scenaries
    
    async def upsert_aois(self, project_id: UUID, aois_data: List[dict]) -> List[AOI]:
        """Upsert AOIs"""
        aois = []
        
        # Get scenaries mapping
        stmt = select(scenaries).where(scenaries.project_id == project_id)
        result = await self.session.execute(stmt)
        scenaries_map = {s.name: s.id for s in result.scalars().all()}
        
        for data in aois_data:
            scenaries_name = data['scenaries_name']
            aoi_name = data['name']
            color = data['color']
            shape_type = data['shape_type']
            shape = data['shape']
            
            scenaries_id = scenaries_map.get(scenaries_name)
            if not scenaries_id:
                continue  # Skip if scenaries not found
            
            # Check if AOI exists
            stmt = select(AOI).where(
                AOI.scenaries_id == scenaries_id,
                AOI.name == aoi_name
            )
            result = await self.session.execute(stmt)
            aoi = result.scalar_one_or_none()
            
            if aoi:
                # Update existing AOI
                aoi.color = color
                aoi.shape_type = shape_type
                aoi.shape = shape
            else:
                # Create new AOI
                aoi = AOI(
                    scenaries_id=scenaries_id,
                    name=aoi_name,
                    color=color,
                    shape_type=shape_type,
                    shape=shape
                )
                self.session.add(aoi)
            
            aois.append(aoi)
        
        await self.session.commit()
        
        # Refresh AOIs
        for aoi in aois:
            await self.session.refresh(aoi)
        
        return aois
    
    async def get_by_project(self, project_id: UUID) -> List[Scenaries]:
        """Get scenaries by project with AOIs"""
        stmt = (
            select(scenaries)
            .options(selectinload(scenaries.aois))
            .where(scenaries.project_id == project_id)
            .order_by(scenaries.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())