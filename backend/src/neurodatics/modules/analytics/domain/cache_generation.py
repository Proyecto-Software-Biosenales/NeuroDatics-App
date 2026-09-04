"""Compatibility imports; shared contracts live in the neutral shared package."""

from neurodatics.shared.cache_generation import (
    CACHE_GENERATION_PREFIX as CACHE_GENERATION_PREFIX,
    generation_token as generation_token,
    is_generation_token as is_generation_token,
    normalize_generation as normalize_generation,
    project_cache_generation as project_cache_generation,
)
