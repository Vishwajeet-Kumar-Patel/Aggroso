import json
from fastapi import APIRouter
from app.core.config import settings
from app.domain.schemas import SchemaDefinition

router = APIRouter(prefix="/schemas", tags=["Schemas"])


@router.get("/source", response_model=SchemaDefinition)
def get_source_schema():
    """Retrieve legacy source database schema definition."""
    with open(settings.SOURCE_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/target", response_model=SchemaDefinition)
def get_target_schema():
    """Retrieve modern target store schema definition."""
    with open(settings.TARGET_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/transformations")
def get_transform_registry():
    """Retrieve registry of supported whitelist transformation rules."""
    with open(settings.TRANSFORM_REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
