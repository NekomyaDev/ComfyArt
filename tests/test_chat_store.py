from __future__ import annotations

import os

from ComfyArt.api import chat_store


def test_chats_are_scoped_by_user_and_project():
    a = chat_store.create_chat(user="default", project="p1", provider="claude-code")
    chat_store.create_chat(user="alice", project="p1", provider="claude-code")
    chat_store.create_chat(user="default", project="p2", provider="codex")
    assert [c["id"] for c in chat_store.list_chats("default", "p1")] == [a["id"]]
    assert len(chat_store.list_chats("alice", "p1")) == 1


def test_database_lives_in_the_system_user_dir(fresh_user_dir):
    chat_store.create_chat(user="alice", project="p", provider="codex")
    assert os.path.isfile(fresh_user_dir / "user" / "__comfyart" / "data.db")


def test_reopen_keeps_owner_and_messages():
    chat = chat_store.create_chat(user="alice", project="p", provider="codex")
    chat_store.create_message(chat_id=chat["id"], role="user", blocks=[{"type": "text", "text": "hi"}])
    chat_store._conn.close()
    chat_store._conn = None
    reloaded = chat_store.get_chat(chat["id"])
    assert reloaded["user"] == "alice"
    assert chat_store.list_messages(chat["id"])[0]["blocks"][0]["text"] == "hi"


def test_branch_copies_up_to_message_and_resume_token():
    chat = chat_store.create_chat(user="default", project="p", provider="claude-code")
    first = chat_store.create_message(chat_id=chat["id"], role="user", blocks=[])
    reply = chat_store.create_message(chat_id=chat["id"], role="assistant", blocks=[], parent_id=first["id"])
    chat_store.update_message(chat["id"], reply["id"], resume_token_after="tok-1")
    chat_store.create_message(chat_id=chat["id"], role="user", blocks=[])
    branch = chat_store.branch_chat(chat["id"], reply["id"])
    messages = chat_store.list_messages(branch["id"])
    assert len(messages) == 2
    assert branch["resume_token"] == "tok-1"
    assert messages[1]["parent_id"] == messages[0]["id"]


def test_update_ignores_none_and_delete_cascades_messages():
    chat = chat_store.create_chat(user="default", project="p", provider="codex", title="t")
    chat_store.create_message(chat_id=chat["id"], role="user", blocks=[])
    chat_store.update_chat(chat["id"], title=None, run_mode="ask")
    assert chat_store.get_chat(chat["id"])["title"] == "t"
    assert chat_store.get_chat(chat["id"])["run_mode"] == "ask"
    assert chat_store.delete_chat(chat["id"]) is True
    assert chat_store.get_chat(chat["id"]) is None
    assert chat_store.list_messages(chat["id"]) == []
    assert chat_store._db().execute("SELECT COUNT(*) FROM comfyart_messages").fetchone()[0] == 0


def test_abort_unfinished_marks_streaming_and_queued():
    chat = chat_store.create_chat(user="default", project="p", provider="codex")
    done = chat_store.create_message(chat_id=chat["id"], role="user", blocks=[])
    chat_store.create_message(chat_id=chat["id"], role="user", blocks=[], status="queued")
    chat_store.create_message(chat_id=chat["id"], role="assistant", blocks=[], status="streaming")
    chat_store.abort_unfinished()
    assert [m["status"] for m in chat_store.list_messages(chat["id"])] == ["done", "aborted", "aborted"]
    assert chat_store.list_messages(chat["id"])[0]["id"] == done["id"]
