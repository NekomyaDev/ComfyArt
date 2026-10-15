import json
import os
import sqlite3
import threading
import time
import uuid
from typing import Optional

from ._common import app_path

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None
_conn_path = ""

_SCHEMA = """
CREATE TABLE IF NOT EXISTS comfyart_chats (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    project TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL,
    resume_token TEXT,
    run_mode TEXT NOT NULL DEFAULT 'auto',
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_comfyart_chats_user_project ON comfyart_chats (user, project);
CREATE TABLE IF NOT EXISTS comfyart_messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    chat_id TEXT NOT NULL REFERENCES comfyart_chats (id) ON DELETE CASCADE,
    parent_id TEXT,
    role TEXT NOT NULL,
    blocks TEXT NOT NULL,
    status TEXT NOT NULL,
    resume_token_after TEXT,
    usage TEXT,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_comfyart_messages_chat ON comfyart_messages (chat_id, seq);
"""

_JSON_FIELDS = ("blocks", "usage")


def _db() -> sqlite3.Connection:
    global _conn, _conn_path
    path = app_path("data.db")
    if _conn is None or _conn_path != path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        _conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _conn.executescript(_SCHEMA)
        _conn_path = path
    return _conn


def _chat(row: sqlite3.Row) -> dict:
    chat = dict(row)
    chat["pinned"] = bool(chat["pinned"])
    chat["archived"] = bool(chat["archived"])
    return chat


def _message(row: sqlite3.Row) -> dict:
    message = dict(row)
    del message["seq"]
    message["blocks"] = json.loads(message["blocks"])
    message["usage"] = json.loads(message["usage"]) if message["usage"] else None
    return message


def _column(key: str, value):
    return json.dumps(value, ensure_ascii=False) if key in _JSON_FIELDS and value is not None else value


def abort_unfinished() -> None:
    with _lock:
        _db().execute("UPDATE comfyart_messages SET status = 'aborted' WHERE status IN ('streaming', 'queued')")


def list_chats(user: str, project: str, *, include_archived: bool = False) -> list[dict]:
    sql = "SELECT * FROM comfyart_chats WHERE user = ? AND project = ?"
    if not include_archived:
        sql += " AND archived = 0"
    with _lock:
        rows = _db().execute(sql + " ORDER BY pinned DESC, updated_at DESC", (user, project)).fetchall()
    return [_chat(r) for r in rows]


def get_chat(chat_id: str) -> Optional[dict]:
    with _lock:
        row = _db().execute("SELECT * FROM comfyart_chats WHERE id = ?", (chat_id,)).fetchone()
    return _chat(row) if row else None


def create_chat(*, user: str, project: str, provider: str, title: str = "", run_mode: str = "auto") -> dict:
    now = time.time()
    chat = {"id": uuid.uuid4().hex, "user": user, "project": project, "title": title, "provider": provider,
            "resume_token": None, "run_mode": run_mode, "pinned": False, "archived": False,
            "created_at": now, "updated_at": now}
    with _lock:
        _db().execute(f"INSERT INTO comfyart_chats ({', '.join(chat)}) VALUES ({', '.join('?' * len(chat))})",
                      tuple(chat.values()))
    return chat


def update_chat(chat_id: str, **fields) -> Optional[dict]:
    values = {k: v for k, v in fields.items() if v is not None}
    values["updated_at"] = time.time()
    with _lock:
        cur = _db().execute(f"UPDATE comfyart_chats SET {', '.join(f'{k} = ?' for k in values)} WHERE id = ?",
                            (*values.values(), chat_id))
        if not cur.rowcount:
            return None
        row = _db().execute("SELECT * FROM comfyart_chats WHERE id = ?", (chat_id,)).fetchone()
    return _chat(row)


def delete_chat(chat_id: str) -> bool:
    with _lock:
        return _db().execute("DELETE FROM comfyart_chats WHERE id = ?", (chat_id,)).rowcount > 0


def branch_chat(chat_id: str, message_id: str) -> Optional[dict]:
    with _lock:
        db = _db()
        source = db.execute("SELECT * FROM comfyart_chats WHERE id = ?", (chat_id,)).fetchone()
        rows = db.execute("SELECT * FROM comfyart_messages WHERE chat_id = ? ORDER BY seq", (chat_id,)).fetchall()
        cut = next((i for i, m in enumerate(rows) if m["id"] == message_id), None)
        if source is None or cut is None:
            return None
        kept = rows[:cut + 1]
        now = time.time()
        chat = {**_chat(source), "id": uuid.uuid4().hex, "pinned": False, "archived": False,
                "created_at": now, "updated_at": now,
                "resume_token": next((m["resume_token_after"] for m in reversed(kept) if m["resume_token_after"]), None)}
        id_map: dict[str, str] = {}
        with db:
            db.execute("BEGIN")
            db.execute(f"INSERT INTO comfyart_chats ({', '.join(chat)}) VALUES ({', '.join('?' * len(chat))})",
                       tuple(chat.values()))
            for m in kept:
                new_id = uuid.uuid4().hex
                db.execute("INSERT INTO comfyart_messages (id, chat_id, parent_id, role, blocks, status, resume_token_after, usage, created_at)"
                           " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (new_id, chat["id"], id_map.get(m["parent_id"] or ""), m["role"], m["blocks"], m["status"],
                            m["resume_token_after"], m["usage"], m["created_at"]))
                id_map[m["id"]] = new_id
    return chat


def list_messages(chat_id: str) -> list[dict]:
    with _lock:
        rows = _db().execute("SELECT * FROM comfyart_messages WHERE chat_id = ? ORDER BY seq", (chat_id,)).fetchall()
    return [_message(r) for r in rows]


def create_message(*, chat_id: str, role: str, blocks: list[dict], status: str = "done",
                   parent_id: Optional[str] = None) -> dict:
    message = {"id": uuid.uuid4().hex, "chat_id": chat_id, "parent_id": parent_id, "role": role,
               "blocks": blocks, "status": status, "resume_token_after": None, "usage": None,
               "created_at": time.time()}
    with _lock:
        db = _db()
        with db:
            db.execute("BEGIN")
            db.execute(f"INSERT INTO comfyart_messages ({', '.join(message)}) VALUES ({', '.join('?' * len(message))})",
                       tuple(_column(k, v) for k, v in message.items()))
            db.execute("UPDATE comfyart_chats SET updated_at = ? WHERE id = ?", (message["created_at"], chat_id))
    return message


def update_message(chat_id: str, message_id: str, **fields) -> Optional[dict]:
    values = {k: _column(k, v) for k, v in fields.items() if v is not None}
    with _lock:
        db = _db()
        if values:
            db.execute(f"UPDATE comfyart_messages SET {', '.join(f'{k} = ?' for k in values)} WHERE id = ? AND chat_id = ?",
                       (*values.values(), message_id, chat_id))
        row = db.execute("SELECT * FROM comfyart_messages WHERE id = ? AND chat_id = ?", (message_id, chat_id)).fetchone()
    return _message(row) if row else None
