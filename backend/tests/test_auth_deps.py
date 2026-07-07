import time

import jwt
import pytest
from fastapi import HTTPException

import deps


def test_create_and_verify_session_token_roundtrip(monkeypatch):
    monkeypatch.setattr(deps, "SESSION_SECRET_KEY", "test-secret")
    token = deps.create_session_token("user-123")
    assert deps.get_current_user_id(authorization=f"Bearer {token}") == "user-123"


def test_missing_authorization_header_raises_401():
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user_id(authorization=None)
    assert exc.value.status_code == 401


def test_malformed_authorization_header_raises_401():
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user_id(authorization="not-a-bearer-token")
    assert exc.value.status_code == 401


def test_tampered_token_raises_401(monkeypatch):
    monkeypatch.setattr(deps, "SESSION_SECRET_KEY", "test-secret")
    token = deps.create_session_token("user-123")
    # 서명 조각의 끝부분을 통째로 다른 문자열로 바꿔서, 어떤 글자가 걸리든 반드시 서명이 깨지게 함
    header, payload, signature = token.split(".")
    tampered = f"{header}.{payload}.{signature[:-6]}zzzzzz"
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user_id(authorization=f"Bearer {tampered}")
    assert exc.value.status_code == 401


def test_token_signed_with_different_secret_is_rejected(monkeypatch):
    monkeypatch.setattr(deps, "SESSION_SECRET_KEY", "secret-a")
    token = deps.create_session_token("user-123")
    monkeypatch.setattr(deps, "SESSION_SECRET_KEY", "secret-b")
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user_id(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401


def test_expired_token_is_rejected(monkeypatch):
    monkeypatch.setattr(deps, "SESSION_SECRET_KEY", "test-secret")
    expired_payload = {"sub": "user-123", "exp": int(time.time()) - 10}
    expired_token = jwt.encode(expired_payload, "test-secret", algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user_id(authorization=f"Bearer {expired_token}")
    assert exc.value.status_code == 401


def test_require_admin_rejects_missing_or_wrong_key(monkeypatch):
    monkeypatch.setattr(deps, "ADMIN_API_KEY", "shared-secret")
    with pytest.raises(HTTPException) as exc:
        deps.require_admin(x_admin_key=None)
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException) as exc:
        deps.require_admin(x_admin_key="wrong")
    assert exc.value.status_code == 401


def test_require_admin_accepts_correct_key(monkeypatch):
    monkeypatch.setattr(deps, "ADMIN_API_KEY", "shared-secret")
    assert deps.require_admin(x_admin_key="shared-secret") is None


def test_require_admin_without_configured_key_is_server_error(monkeypatch):
    monkeypatch.setattr(deps, "ADMIN_API_KEY", None)
    with pytest.raises(HTTPException) as exc:
        deps.require_admin(x_admin_key="anything")
    assert exc.value.status_code == 500


def test_is_admin_user_matches_only_the_sentinel():
    assert deps.is_admin_user(deps.ADMIN_USER_ID) is True
    assert deps.is_admin_user("some-real-uuid-1234") is False
    assert deps.is_admin_user("") is False
