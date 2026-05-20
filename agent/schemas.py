from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class REQItem(_Base):
    id: str
    text: str
    source: str
    type: str


class RequirementsOutput(_Base):
    requirements: List[REQItem]
    ambiguities: List[dict]
    contradictions: List[dict]
    assumptions: List[dict]


class HLSItem(_Base):
    id: str
    title: str
    description: str
    linked_requirements: List[str]
    type: str


class HLSOutput(_Base):
    hls_list: List[HLSItem]


class TCStep(_Base):
    action: str
    test_data: str = ""
    expected: str


class TCItem(_Base):
    id: str
    hls_id: str
    linked_requirements: List[str]
    title: str
    preconditions: list
    steps: List[TCStep]
    priority: str
    type: str
    test_type: str = "Functional"


class TCOutput(_Base):
    tc_list: List[TCItem]


class ClassItem(_Base):
    tc_id: str
    mode: str
    tool: str
    confidence: float
    reason: str


class ClassificationOutput(_Base):
    tc_classifications: List[ClassItem]


class TDField(_Base):
    field: str
    type: str
    source: Optional[str] = None
    value: Optional[str] = None
    sensitive: bool


class TDItem(_Base):
    tc_id: str
    mode: str
    fields: List[TDField]


class TestDataOutput(_Base):
    test_data_requirements: List[TDItem]


class ResultItem(_Base):
    tc_id: str
    hls_id: str
    req_ids: List[str]
    status: str
    duration_ms: int
    rca_class: Optional[str] = None
    rca_detail: Optional[str] = None
    artifact_urls: List[str]


class ReportOutput(_Base):
    summary: dict
    results: List[ResultItem]
    coverage_percentage: float
    langsmith_trace_url: Optional[str] = None


class GeneratedScript(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tc_id: str
    hls_id: str
    mode: str           # 'automated' | 'hybrid'
    file_path: str
    commit_sha: str
    branch: str
    language: str       # 'typescript'
    preview_url: str    # GitHub blob URL for UI display


class GeneratedScriptsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scripts: List[GeneratedScript]
