from dataclasses import dataclass

from ..config import get_settings


@dataclass
class LLMRuntime:
    provider: str
    configured: bool


def get_llm_runtime() -> LLMRuntime:
    settings = get_settings()
    provider = settings.llm_provider.strip().lower()
    if provider == "gemini":
        return LLMRuntime(provider="gemini", configured=bool(settings.gemini_api_key))
    return LLMRuntime(provider=provider or "unknown", configured=False)
