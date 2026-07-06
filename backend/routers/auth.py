from typing import Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from deps import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    KAKAO_CLIENT_SECRET,
    KAKAO_REST_API_KEY,
    PROFILE_BUCKET,
    require_supabase,
    safe_execute,
)

router = APIRouter()

# ---------------------------------------------------------------------
# 로그인 / 회원가입 (기존 방식 — 간단 식별, 유지는 하되 카카오 로그인이 기본이 됨)
# ---------------------------------------------------------------------


class UserSignup(BaseModel):
    login_id: str
    nickname: str


class UserLogin(BaseModel):
    login_id: str


@router.post("/users/signup")
def signup(payload: UserSignup):
    db = require_supabase()
    existing = db.table("users").select("id").eq("login_id", payload.login_id).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디예요.")
    result = db.table("users").insert(
        {"login_id": payload.login_id, "nickname": payload.nickname}
    ).execute()
    return result.data[0]


@router.post("/users/login")
def login(payload: UserLogin):
    db = require_supabase()
    result = db.table("users").select("*").eq("login_id", payload.login_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="등록되지 않은 아이디예요. 회원가입을 먼저 해주세요.")
    return result.data[0]


# ---------------------------------------------------------------------
# 닉네임 / 프로필 (온보딩 + 마이페이지 설정 공용)
# ---------------------------------------------------------------------


@router.get("/users/check-nickname")
def check_nickname(nickname: str, exclude_user_id: Optional[str] = None):
    db = require_supabase()
    name = nickname.strip()
    result = safe_execute(db.table("users").select("id").eq("nickname", name), "닉네임 확인 실패")
    taken = any(u["id"] != exclude_user_id for u in result.data)
    return {"available": not taken}


@router.patch("/users/{user_id}/profile")
async def update_profile(
    user_id: str,
    nickname: str = Form(...),
    image: Optional[UploadFile] = File(None),
):
    nickname = nickname.strip()
    if not nickname:
        raise HTTPException(status_code=422, detail="닉네임을 입력해주세요.")
    if len(nickname) > 20:
        raise HTTPException(status_code=422, detail="닉네임은 20자 이내로 입력해주세요.")

    db = require_supabase()

    # 중복 확인 (본인 제외)
    dup_check = safe_execute(db.table("users").select("id").eq("nickname", nickname), "닉네임 확인 실패")
    if any(u["id"] != user_id for u in dup_check.data):
        raise HTTPException(status_code=409, detail="이미 사용 중인 닉네임이에요.")

    update_row = {"nickname": nickname}

    if image is not None:
        contents = await image.read()
        extension = (image.filename or "jpg").split(".")[-1]
        storage_path = f"{user_id}.{extension}"
        try:
            db.storage.from_(PROFILE_BUCKET).upload(
                storage_path,
                contents,
                {"content-type": image.content_type or "image/jpeg", "upsert": "true"},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"프로필 사진 업로드 실패: {e}")

        public_url_result = db.storage.from_(PROFILE_BUCKET).get_public_url(storage_path)
        update_row["profile_image_url"] = (
            public_url_result
            if isinstance(public_url_result, str)
            else public_url_result.get("publicUrl") or public_url_result.get("public_url")
        )

    result = safe_execute(db.table("users").update(update_row).eq("id", user_id), "프로필 수정 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다.")
    return result.data[0]


@router.delete("/users/{user_id}")
def delete_user(user_id: str):
    db = require_supabase()
    # checkins.user_id는 users(id)를 참조하므로(cascade 없음) 먼저 지워야 유저 삭제가 FK 위반 없이 됨
    safe_execute(db.table("checkins").delete().eq("user_id", user_id), "방문 기록 삭제 실패")
    result = safe_execute(db.table("users").delete().eq("id", user_id), "회원 탈퇴 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다.")
    return {"deleted": True}


# ---------------------------------------------------------------------
# 카카오 로그인 (Supabase 내장 기능 대신 직접 구현 — 이메일 동의항목 요청 안 함)
# ---------------------------------------------------------------------


class KakaoLoginRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post("/auth/kakao")
async def kakao_login(payload: KakaoLoginRequest):
    db = require_supabase()
    if not KAKAO_REST_API_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_REST_API_KEY가 설정되지 않았습니다 (.env 확인)")

    # 1. 인가 코드 -> 액세스 토큰 교환
    token_form = {
        "grant_type": "authorization_code",
        "client_id": KAKAO_REST_API_KEY,
        "redirect_uri": payload.redirect_uri,
        "code": payload.code,
    }
    if KAKAO_CLIENT_SECRET:
        token_form["client_secret"] = KAKAO_CLIENT_SECRET

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data=token_form,
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        )

    if token_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"카카오 토큰 발급 실패: {token_res.text}")

    access_token = token_res.json().get("access_token")

    # 2. 액세스 토큰으로 사용자 정보 조회
    async with httpx.AsyncClient() as client:
        profile_res = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if profile_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"카카오 사용자 정보 조회 실패: {profile_res.text}")

    profile = profile_res.json()
    kakao_id = str(profile["id"])
    nickname = (
        profile.get("kakao_account", {}).get("profile", {}).get("nickname")
        or profile.get("properties", {}).get("nickname")
        or "카카오사용자"
    )

    # 3. 기존 회원이면 그대로, 아니면 새로 생성 (upsert)
    existing = db.table("users").select("*").eq("kakao_id", kakao_id).execute()
    if existing.data:
        return {**existing.data[0], "is_new": False}

    result = db.table("users").insert({"kakao_id": kakao_id, "nickname": nickname}).execute()
    return {**result.data[0], "is_new": True}


# ---------------------------------------------------------------------
# 구글 로그인 (카카오 로그인과 동일한 authorization code 플로우)
# ---------------------------------------------------------------------


class GoogleLoginRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post("/auth/google")
async def google_login(payload: GoogleLoginRequest):
    db = require_supabase()
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET이 설정되지 않았습니다 (.env 확인)")

    # 1. 인가 코드 -> 액세스 토큰 교환
    token_form = {
        "grant_type": "authorization_code",
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": payload.redirect_uri,
        "code": payload.code,
    }

    async with httpx.AsyncClient() as client:
        token_res = await client.post("https://oauth2.googleapis.com/token", data=token_form)

    if token_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"구글 토큰 발급 실패: {token_res.text}")

    access_token = token_res.json().get("access_token")

    # 2. 액세스 토큰으로 사용자 정보 조회
    async with httpx.AsyncClient() as client:
        profile_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if profile_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"구글 사용자 정보 조회 실패: {profile_res.text}")

    profile = profile_res.json()
    google_id = profile.get("sub")
    nickname = profile.get("name") or "구글사용자"

    # 3. 기존 회원이면 그대로, 아니면 새로 생성 (upsert)
    existing = db.table("users").select("*").eq("google_id", google_id).execute()
    if existing.data:
        return {**existing.data[0], "is_new": False}

    result = db.table("users").insert({"google_id": google_id, "nickname": nickname}).execute()
    return {**result.data[0], "is_new": True}
