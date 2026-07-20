from __future__ import annotations

import json as _json

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ...auth import AuthUser, require_permission
from ...config import get_settings
from ...db import is_db_available, is_db_configured, session_scope
from ...services.ai_agent import run_agent, stream_agent
from ...services.ai_schema import NotebookResponse
from ...services.report_builder import get_report_path
from ...services.query_memory import record_thumb

router = APIRouter(prefix="/api/chat", tags=["chat"])

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions"
OPENAI_BASE = "https://api.openai.com/v1/chat/completions"

DEFAULT_MODELS = {
    "gemini": "gemini-2.5-pro",
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
    _actor: AuthUser = Depends(require_permission("chat:use")),
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


# ----------------------------------------------------------------------
# Notebook-style chat: Gemini function calling over live Supabase data.
# Returns a list of .deepnote-schema blocks for a notebook renderer.
# ----------------------------------------------------------------------
class NotebookChatRequest(BaseModel):
    question: str
    history: list[HistoryMessage] = []
    model: str | None = None


@router.post("/notebook", response_model=NotebookResponse)
async def chat_notebook(
    request: NotebookChatRequest,
    _actor: AuthUser = Depends(require_permission("chat:use")),
) -> NotebookResponse:
    if not is_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured — notebook chat requires a live Supabase snapshot.",
        )
    if not is_db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now. Try again in a moment.",
        )

    history_dicts = [{"role": m.role, "content": m.content} for m in request.history]
    with session_scope() as session:
        return await run_agent(
            session=session,
            question=request.question,
            history=history_dicts,
            model=request.model,
        )


# ----------------------------------------------------------------------
# Streaming notebook-chat (Server-Sent Events)
#
# Emits each agent step live so the UI can show a Deepnote-style execution
# trail (Planning → Calling tool → Tool done → Composing → Final blocks).
#
# SSE wire format per event:
#   event: <type>\n
#   data: <json-serialised payload>\n
#   \n
# Terminal event is always `done`.
# ----------------------------------------------------------------------
def _sse_line(event: dict) -> str:
    name = event.get("event", "message")
    payload = event.get("data")
    # json.dumps always produces a string; SSE `data:` lines must not contain
    # raw newlines, which json.dumps avoids by default (no indent).
    return f"event: {name}\ndata: {_json.dumps(payload, default=str)}\n\n"


@router.post("/notebook/stream")
async def chat_notebook_stream(
    request: NotebookChatRequest,
    _actor: AuthUser = Depends(require_permission("chat:use")),
):
    if not is_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured — notebook chat requires a live Supabase snapshot.",
        )
    if not is_db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now. Try again in a moment.",
        )

    history_dicts = [{"role": m.role, "content": m.content} for m in request.history]

    async def generator():
        # Keep the DB session alive for the full streaming lifetime.
        # `session_scope` is a sync contextmanager, so we use it inline.
        try:
            with session_scope() as session:
                async for event in stream_agent(
                    session=session,
                    question=request.question,
                    history=history_dicts,
                    model=request.model,
                ):
                    yield _sse_line(event)
        except Exception as exc:  # noqa: BLE001
            yield _sse_line({"event": "error", "data": {"message": str(exc)}})
            yield _sse_line({"event": "done", "data": None})

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # tell reverse proxies (nginx) not to buffer
            "Connection": "keep-alive",
        },
    )


# ----------------------------------------------------------------------
# Report PDF download — served by report_builder.render_report_pdf().
# ----------------------------------------------------------------------
@router.get("/reports/{file_name}")
def download_report(
    file_name: str,
    _actor: AuthUser = Depends(require_permission("reports:read")),
) -> FileResponse:
    path = get_report_path(file_name)
    if not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=file_name,
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


# ----------------------------------------------------------------------
# Thumbs feedback for query_memory rows — used to demote bad answers
# from future few-shot retrieval and to surface good ones for fine-tuning.
# ----------------------------------------------------------------------
class ThumbRequest(BaseModel):
    memory_id: int
    direction: str  # "up" or "down"


@router.post("/feedback")
def post_feedback(
    request: ThumbRequest,
    _actor: AuthUser = Depends(require_permission("feedback:write")),
) -> dict[str, bool]:
    if request.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")
    if not is_db_available():
        raise HTTPException(status_code=503, detail="DB not available")
    with session_scope() as session:
        ok = record_thumb(session, request.memory_id, request.direction)
    return {"ok": ok}
