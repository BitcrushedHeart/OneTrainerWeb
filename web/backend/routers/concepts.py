from fastapi import APIRouter, HTTPException

from web.backend.services.concept_service import ConceptService
from web.backend.services.config_service import ConfigService

router = APIRouter(prefix="/concepts", tags=["concepts"])


@router.get("")
def get_concepts() -> list[dict]:
    """
    Load concepts from the file referenced by the current config's
    concept_file_name field.
    """
    service = ConfigService.get_instance()
    concept_path = service.config.concept_file_name

    if not concept_path:
        raise HTTPException(status_code=422, detail="No concept_file_name configured")

    concept_service = ConceptService()
    try:
        return concept_service.load_concepts(concept_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Concept file not found: {concept_path}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("")
def save_concepts(concepts: list[dict]) -> dict:
    """
    Save concepts to the file referenced by the current config's
    concept_file_name field.
    """
    service = ConfigService.get_instance()
    concept_path = service.config.concept_file_name

    if not concept_path:
        raise HTTPException(status_code=422, detail="No concept_file_name configured")

    concept_service = ConceptService()
    try:
        concept_service.save_concepts(concept_path, concepts)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"saved": len(concepts), "path": concept_path}
