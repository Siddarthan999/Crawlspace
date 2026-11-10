from typing import Optional, Any
from pydantic import BaseModel, Field


class CrawlCreate(BaseModel):
    seeds: list[str] = Field(..., min_length=1)
    preset: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    checks_config: dict[str, Any] = Field(default_factory=dict)
    note: str = ""


class CrawlPatch(BaseModel):
    note: Optional[str] = None
    checks_config: Optional[dict[str, Any]] = None


class ReanalyzeBody(BaseModel):
    checks_config: dict[str, Any] = Field(default_factory=dict)


class PresetCreate(BaseModel):
    name: str
    config: dict[str, Any] = Field(default_factory=dict)
    checks_config: dict[str, Any] = Field(default_factory=dict)


class ScheduleCreate(BaseModel):
    seeds: list[str]
    config: dict[str, Any] = Field(default_factory=dict)
    checks_config: dict[str, Any] = Field(default_factory=dict)
    every_hours: int = 24
    enabled: bool = True


class ScheduleUpdate(BaseModel):
    every_hours: Optional[int] = None
    enabled: Optional[bool] = None
