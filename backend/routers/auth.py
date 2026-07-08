from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from deps import (
    ADMIN_API_KEY,
    ADMIN_USER_ID,
    CHECKIN_BUCKET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    KAKAO_CLIENT_SECRET,
    KAKAO_REST_API_KEY,
    NAVER_CLIENT_ID,
    NAVER_CLIENT_SECRET,
    PROFILE_BUCKET,
    create_session_token,
    get_current_user_id,
    rate_limit,
    require_supabase,
    safe_execute,
    validate_image_bytes,
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
def signup(payload: UserSignup, request: Request):
    # 이 레거시 로그인은 비밀번호가 없어서 login_id만 알면 그 계정이 되는 구조 — 계정 생성/탈취 시도를
    # 빠르게 반복하지 못하도록 IP당 요청 빈도를 제한한다.
    rate_limit(f"signup:{request.client.host}", max_requests=10, window_seconds=60)
    db = require_supabase()
    existing = db.table("users").select("id").eq("login_id", payload.login_id).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디예요.")
    result = db.table("users").insert(
        {"login_id": payload.login_id, "nickname": payload.nickname}
    ).execute()
    user = result.data[0]
    return {**user, "session_token": create_session_token(user["id"])}


@router.post("/users/login")
def login(payload: UserLogin, request: Request):
    rate_limit(f"login:{request.client.host}", max_requests=10, window_seconds=60)
    db = require_supabase()
    result = db.table("users").select("*").eq("login_id", payload.login_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="등록되지 않은 아이디예요. 회원가입을 먼저 해주세요.")
    user = result.data[0]
    return {**user, "session_token": create_session_token(user["id"])}


# ---------------------------------------------------------------------
# 관리자 로그인 — 소셜 로그인 없이 관리자 키만으로 들어와서 테스트를 편하게 하기 위한 용도.
# users 테이블에 행을 만들지 않고(불필요한 테스트 데이터 방지), 어떤 매장이든 체크인 승인·
# 리워드 관리를 할 수 있는 특수 신원(ADMIN_USER_ID)의 세션 토큰만 발급한다.
# ---------------------------------------------------------------------


class AdminLoginRequest(BaseModel):
    admin_key: str


@router.post("/auth/admin")
def admin_login(payload: AdminLoginRequest, request: Request):
    rate_limit(f"admin-login:{request.client.host}", max_requests=10, window_seconds=60)
    if not ADMIN_API_KEY or payload.admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="관리자 키가 올바르지 않아요.")
    return {
        "id": ADMIN_USER_ID,
        "nickname": "관리자",
        "profile_image_url": None,
        "is_admin": True,
        "is_new": False,
        "session_token": create_session_token(ADMIN_USER_ID),
    }


# ---------------------------------------------------------------------
# 닉네임 / 프로필 (온보딩 + 마이페이지 설정 공용)
# ---------------------------------------------------------------------


@router.get("/users/check-nickname", dependencies=[Depends(get_current_user_id)])
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
    current_user_id: str = Depends(get_current_user_id),
):
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="본인 프로필만 수정할 수 있어요.")

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
        validate_image_bytes(contents)
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


def _delete_checkin_photos(db, user_id: str) -> None:
    # storage.list()는 방금 올라간 파일을 바로 못 잡는 인덱싱 지연이 있어서(직접 확인함),
    # 대신 DB에 이미 정확히 기록돼 있는 photo_url에서 "{user_id}/{파일명}" 경로를 그대로 뽑아 지운다.
    # 스토리지 정리는 회원 탈퇴 자체를 막을 이유가 없어서 실패해도 조용히 넘어간다.
    try:
        rows = db.table("checkins").select("photo_url").eq("user_id", user_id).execute()
        marker = f"/{CHECKIN_BUCKET}/"
        paths = []
        for row in rows.data or []:
            url = row.get("photo_url") or ""
            if marker in url:
                paths.append(url.split(marker, 1)[1])
        if paths:
            db.storage.from_(CHECKIN_BUCKET).remove(paths)
    except Exception:
        pass


@router.delete("/users/{user_id}")
def delete_user(user_id: str, current_user_id: str = Depends(get_current_user_id)):
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="본인 계정만 탈퇴할 수 있어요.")

    db = require_supabase()
    _delete_checkin_photos(db, user_id)
    # checkins/user_badges/user_rewards/reviews 모두 user_id가 users(id)를 참조하는데 cascade가 없어서,
    # 먼저 지워야 유저 삭제가 FK 위반 없이 됨 (예: 리워드를 받은 적 있으면 user_rewards 때문에 막힘)
    safe_execute(db.table("checkins").delete().eq("user_id", user_id), "방문 기록 삭제 실패")
    safe_execute(db.table("user_badges").delete().eq("user_id", user_id), "뱃지 기록 삭제 실패")
    safe_execute(db.table("user_rewards").delete().eq("user_id", user_id), "리워드 기록 삭제 실패")
    safe_execute(db.table("reviews").delete().eq("user_id", user_id), "리뷰 삭제 실패")
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
        user = existing.data[0]
        return {**user, "is_new": False, "session_token": create_session_token(user["id"])}

    user = db.table("users").insert({"kakao_id": kakao_id, "nickname": nickname}).execute().data[0]
    return {**user, "is_new": True, "session_token": create_session_token(user["id"])}


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
        user = existing.data[0]
        return {**user, "is_new": False, "session_token": create_session_token(user["id"])}

    user = db.table("users").insert({"google_id": google_id, "nickname": nickname}).execute().data[0]
    return {**user, "is_new": True, "session_token": create_session_token(user["id"])}


# ---------------------------------------------------------------------
# 네이버 로그인 (카카오/구글과 동일한 authorization code 플로우)
# ---------------------------------------------------------------------


class NaverLoginRequest(BaseModel):
    code: str
    redirect_uri: str
    state: str


@router.post("/auth/naver")
async def naver_login(payload: NaverLoginRequest):
    db = require_supabase()
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 설정되지 않았습니다 (.env 확인)")

    # 1. 인가 코드 -> 액세스 토큰 교환 (네이버는 CSRF 방지용 state를 발급/교환 양쪽에 동일하게 실어야 함)
    token_params = {
        "grant_type": "authorization_code",
        "client_id": NAVER_CLIENT_ID,
        "client_secret": NAVER_CLIENT_SECRET,
        "redirect_uri": payload.redirect_uri,
        "code": payload.code,
        "state": payload.state,
    }

    async with httpx.AsyncClient() as client:
        token_res = await client.get("https://nid.naver.com/oauth2.0/token", params=token_params)

    if token_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"네이버 토큰 발급 실패: {token_res.text}")

    token_data = token_res.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail=f"네이버 토큰 발급 실패: {token_data}")

    # 2. 액세스 토큰으로 사용자 정보 조회
    async with httpx.AsyncClient() as client:
        profile_res = await client.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if profile_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"네이버 사용자 정보 조회 실패: {profile_res.text}")

    profile = profile_res.json().get("response") or {}
    naver_id = profile.get("id")
    if not naver_id:
        raise HTTPException(status_code=502, detail="네이버 사용자 정보에 id가 없습니다.")
    nickname = profile.get("nickname") or profile.get("name") or "네이버사용자"

    # 3. 기존 회원이면 그대로, 아니면 새로 생성 (upsert)
    existing = db.table("users").select("*").eq("naver_id", naver_id).execute()
    if existing.data:
        user = existing.data[0]
        return {**user, "is_new": False, "session_token": create_session_token(user["id"])}

    user = db.table("users").insert({"naver_id": naver_id, "nickname": nickname}).execute().data[0]
    return {**user, "is_new": True, "session_token": create_session_token(user["id"])}
