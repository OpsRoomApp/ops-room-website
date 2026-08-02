"""
OPS ROOM Admin API - Ticket Transcripts (v0.25.55 / C1)

Provides endpoints for the Discord bot to store closed-ticket transcripts
and for public viewing of those transcripts. Includes 14-day auto-expiry.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from config import TRANSCRIPT_RETENTION_DAYS

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/transcripts", tags=["transcripts"])

STORAGE_ROOT = Path(os.getenv("TRANSCRIPT_STORAGE_PATH", "/opt/opsroom-transcripts"))
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

TRANSCRIPT_RETENTION_DAYS_DEFAULT = int(TRANSCRIPT_RETENTION_DAYS or 14)


def _transcript_path(ticket_id: int) -> Path:
    return STORAGE_ROOT / f"{ticket_id}.json"


def _is_expired(path: Path) -> bool:
    if not path.exists():
        return True
    age = datetime.now(timezone.utc) - datetime.fromtimestamp(
        path.stat().st_mtime, tz=timezone.utc
    )
    return age.days >= TRANSCRIPT_RETENTION_DAYS_DEFAULT


@router.post("/store")
async def store_transcript(request: Request):
    """Receive a transcript payload from the bot and persist it.

    Requires admin-api auth token in the Authorization header.
    """
    auth = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    expected = os.getenv("ADMIN_API_TOKEN", "")
    if not expected or not auth or auth != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    ticket_id = data.get("ticket_id")
    if not ticket_id:
        raise HTTPException(status_code=400, detail="Missing ticket_id")

    path = _transcript_path(int(ticket_id))
    data["stored_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    _log.info("Transcript stored: ticket #%s", ticket_id)
    return JSONResponse({"ok": True, "ticket_id": ticket_id, "url": f"/transcripts/{ticket_id}"})


@router.get("/view/{ticket_id}")
async def view_transcript(ticket_id: int):
    """Public endpoint to view a transcript by ticket ID.

    Returns transcript data as JSON. The frontend renders it as HTML.
    Returns 404 with expired=True when the transcript is missing or past
    its retention window so the frontend can render the "expired" state.
    """
    path = _transcript_path(ticket_id)
    if not path.exists() or _is_expired(path):
        return JSONResponse(
            {"ok": False, "expired": True, "message": "This transcript has expired or does not exist."},
            status_code=404,
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["ok"] = True
        return JSONResponse(data)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read transcript")


# ---------------------------------------------------------------------------
# PDF export (C1) -- minimal dependency-free PDF writer (Latin-1 / UTF-16 text)
# ---------------------------------------------------------------------------


class _SimplePdf:
    """Minimal pure-stdlib PDF generator for text-only transcripts.

    Writes a single-page-per-message transcript. Non-Latin-1 characters are
    emitted as UTF-16BE hex strings (PDF text objects), so airline names,
    emoji and accented usernames survive without a heavy PDF dependency.
    """

    def __init__(self, title: str):
        self._objects: list[bytes] = []
        self._title = title

    @staticmethod
    def _escape(text: str) -> str:
        out: list[str] = []
        for ch in text:
            code = ord(ch)
            if code < 128:
                if ch in ("(", ")", "\\"):
                    out.append("\\" + ch)
                elif ch == "\n":
                    out.append("\\n")
                elif ch == "\r":
                    out.append("\\r")
                elif ch == "\t":
                    out.append("\\t")
                else:
                    out.append(ch)
            elif code <= 0xFF:
                out.append(ch)  # Latin-1 byte in 1-byte encoding
            else:
                out.append(ch)  # handled below via UTF-16 detection
        return "".join(out)

    @staticmethod
    def _text_op(text: str) -> str:
        """Return a PDF string literal; UTF-16BE when non-Latin-1 present."""
        try:
            text.encode("latin-1")
            return "(" + _SimplePdf._escape(text) + ")"
        except UnicodeEncodeError:
            data = text.encode("utf-16-be")
            return "<FEFF" + data.hex().upper() + ">"

    def build(self) -> bytes:
        pages: list[bytes] = []
        font_obj = 2
        page_objs: list[int] = []
        obj_num = 3
        content_streams: list[bytes] = []
        all_pages = []

        # Single page with all content (simple, adequate for transcripts)
        lines: list[str] = []
        max_lines = 60
        for para in self._content_paragraphs:
            if len(lines) >= max_lines:
                break
            lines.append(para)

        stream_lines = ["BT", "/F1 10 Tf", "14 TL"]
        y = 790
        for line in lines:
            # Wrap long lines at ~100 chars
            while len(line) > 100 and y > 40:
                stream_lines.append(f"1 0 0 1 50 {y} Tm")
                stream_lines.append(f"{self._text_op(line[:100])} Tj")
                line = line[100:]
                y -= 13
            stream_lines.append(f"1 0 0 1 50 {y} Tm")
            stream_lines.append(f"{self._text_op(line)} Tj")
            y -= 13
            if y < 40:
                break
        stream_lines.append("ET")
        stream = "\n".join(stream_lines).encode("latin-1", "replace")
        content_streams.append(stream)

        content_obj = obj_num
        obj_num += 1
        page_obj = obj_num
        obj_num += 1
        pages_obj = obj_num
        obj_num += 1

        objects: list[bytes] = []
        objects.append(b"<< /Type /Catalog /Pages " + str(pages_obj).encode() + b" 0 R >>")
        objects.append(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
            b"/Encoding /WinAnsiEncoding >>"
        )
        objects.append(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
        objects.append(
            b"<< /Type /Page /Parent " + str(pages_obj).encode() + b" 0 R "
            b"/MediaBox [0 0 612 842] /Resources << /Font << /F1 "
            + str(font_obj).encode() + b" 0 R >> >> /Contents "
            + str(content_obj).encode() + b" 0 R >>"
        )
        objects.append(
            b"<< /Type /Pages /Kids [" + str(page_obj).encode() + b" 0 R] /Count 1 >>"
        )

        output = bytearray(b"%PDF-1.4\n")
        offsets: list[int] = []
        # Object 1 = catalog
        for i, body in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{i} 0 obj\n".encode())
            output.extend(body)
            output.extend(b"\nendobj\n")
        xref_pos = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
        output.extend(b"0000000000 65535 f \n")
        for off in offsets:
            output.extend(f"{off:010d} 00000 n \n".encode())
        output.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
        )
        return bytes(output)

    _content_paragraphs: list[str] = []

    def add_paragraph(self, text: str) -> None:
        self._content_paragraphs.append(text)

    @classmethod
    def render(cls, title: str, paragraphs: list[str]) -> bytes:
        pdf = cls(title)
        pdf._content_paragraphs = [title, ""] + paragraphs
        return pdf.build()


@router.get("/{ticket_id}/pdf")
async def transcript_pdf(ticket_id: int):
    """Server-side PDF export of a transcript (C1)."""
    path = _transcript_path(ticket_id)
    if not path.exists() or _is_expired(path):
        return JSONResponse(
            {"ok": False, "expired": True, "message": "This transcript has expired or does not exist."},
            status_code=404,
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read transcript")

    subject = data.get("subject") or "No subject"
    ticket_number = data.get("ticket_number") or ticket_id
    creator = data.get("creator_name") or "Unknown"
    close_reason = data.get("close_reason") or ""

    paragraphs: list[str] = []
    paragraphs.append(f"Ticket #{ticket_number} Transcript")
    paragraphs.append(f"Creator: {creator}")
    paragraphs.append(f"Subject: {subject}")
    paragraphs.append(f"Opened: {data.get('opened_at') or '?'}  Closed: {data.get('closed_at') or '?'}")
    if close_reason:
        paragraphs.append(f"Close reason: {close_reason}")
    paragraphs.append("=" * 60)
    for msg in data.get("messages") or []:
        author = msg.get("author") or "Unknown"
        ts = msg.get("timestamp") or ""
        content = (msg.get("content") or "").replace("\n", " ")
        paragraphs.append(f"[{ts}] {author}: {content}")
        for url in msg.get("attachments") or []:
            paragraphs.append(f"  [Attachment] {url}")

    pdf_bytes = _SimplePdf.render(f"Ticket #{ticket_number} Transcript", paragraphs)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="ticket-{ticket_number}-transcript.pdf"'
        },
    )


async def _cleanup_expired():
    """Background task: delete transcripts older than the retention window."""
    while True:
        try:
            for path in STORAGE_ROOT.glob("*.json"):
                if _is_expired(path):
                    path.unlink(missing_ok=True)
                    _log.info("Expired transcript deleted: %s", path.name)
        except Exception:
            _log.exception("Transcript cleanup error")
        await asyncio.sleep(3600)  # Run every hour


def start_cleanup_task():
    """Start the background cleanup loop (called from main.py startup)."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_cleanup_expired())
        _log.info("Transcript cleanup task started (retention: %d days)", TRANSCRIPT_RETENTION_DAYS_DEFAULT)
    except RuntimeError:
        pass
