from __future__ import annotations

import httpx
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from ...config import get_settings

router = APIRouter(prefix="/api/chat", tags=["chat"])

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions"
OPENAI_BASE = "https://api.openai.com/v1/chat/completions"

DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash",
    "nvidia": "qwen/qwen2-7b-instruct",
    "openai": "gpt-4.1-mini",
}

TIMEOUT = 120.0


class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    provider: str
    model: str | None = None
    instructions: str
    input_text: str
    history: list[HistoryMessage] = []


class ChatResponse(BaseModel):
    text: str
    used_search: bool = False
    provider: str
    model: str


def _resolve_key(provider: str, override: str | None) -> str:
    """Return the API key to use: client override first, then backend .env."""
    if override and override.strip():
        return override.strip()
    settings = get_settings()
    key = settings.api_key_for(provider)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No API key configured for provider '{provider}'. Set {provider.upper()}_API_KEY in the backend environment.",
        )
    return key


async def _call_gemini(model: str, api_key: str, request: ChatRequest) -> str:
    contents = [
        *[
            {
                "role": "model" if m.role == "assistant" else "user",
                "parts": [{"text": m.content}],
            }
            for m in request.history
        ],
        {"role": "user", "parts": [{"text": request.input_text}]},
    ]
    body = {
        "systemInstruction": {"parts": [{"text": request.instructions}]},
        "contents": contents,
    }
    url = f"{GEMINI_BASE}/{model}:generateContent?key={api_key}"
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(url, json=body)
    data = r.json()
    if not r.is_success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=data.get("error", {}).get("message") or f"Gemini error {r.status_code}",
        )
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Empty response from Gemini.") from exc


async def _call_openai_compat(url: str, model: str, api_key: str, request: ChatRequest) -> str:
    messages = [
        {"role": "system", "content": request.instructions},
        *[{"role": m.role, "content": m.content} for m in request.history],
        {"role": "user", "content": request.input_text},
    ]
    body = {"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 4096}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(url, json=body, headers={"Authorization": f"Bearer {api_key}"})
    data = r.json()
    if not r.is_success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=data.get("error", {}).get("message") or f"LLM error {r.status_code}",
        )
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Empty response from LLM.") from exc


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    x_llm_api_key: str | None = Header(default=None, alias="X-LLM-Api-Key"),
) -> ChatResponse:
    provider = request.provider.strip().lower()
    model = (request.model or DEFAULT_MODELS.get(provider, "")).strip()
    api_key = _resolve_key(provider, x_llm_api_key)

    if provider == "gemini":
        text = await _call_gemini(model or DEFAULT_MODELS["gemini"], api_key, request)
    elif provider == "nvidia":
        text = await _call_openai_compat(NVIDIA_BASE, model or DEFAULT_MODELS["nvidia"], api_key, request)
    elif provider == "openai":
        text = await _call_openai_compat(OPENAI_BASE, model or DEFAULT_MODELS["openai"], api_key, request)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{provider}'. Use gemini, nvidia, or openai.",
        )

    return ChatResponse(text=text, used_search=False, provider=provider, model=model)
