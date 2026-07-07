import os
import time

import jwt
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from postgrest.exceptions import APIError
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")
KAKAO_CLIENT_SECRET = os.getenv("KAKAO_CLIENT_SECRET")  # 없어도 동작함 (선택사항)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")
NTS_API_KEY = os.getenv("NTS_API_KEY")  # 공공데이터포털 "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 서비스키
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "dev-only-insecure-secret-change-me")  # 세션 토큰 서명용
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")  # 관리자 화면(/admin) 보호용 공유 키

CHECKIN_BUCKET = "checkin-photos"
BADGE_BUCKET = "badge-images"
STORE_THUMBNAIL_BUCKET = "store-thumbnails"
PROFILE_BUCKET = "profile-images"

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def require_supabase():
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase 연결이 설정되지 않았습니다 (.env 확인)")
    return supabase


def safe_execute(query, error_message: str = "요청 처리 중 오류가 발생했습니다"):
    """
    Supabase 쿼리 실행 중 에러가 나면 깔끔한 HTTPException으로 바꿔줌.
    사용법: safe_execute(db.table('stores').select('*'), '매장 목록 조회 실패')
    """
    try:
        return query.execute()
    except APIError as e:
        raise HTTPException(status_code=400, detail=f"{error_message}: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{error_message}: {str(e)}")


# ---------------------------------------------------------------------
# 인증 — 로그인 시 발급한 세션 토큰으로 "이 요청이 실제로 본인/그 매장 사장님이 보낸 게 맞는지" 검증.
# 이전에는 프론트가 보내는 user_id/owner_id를 그대로 믿어서, 아무 user_id나 넣어 체크인을 셀프 승인하고
# 스탬프를 무제한으로 채울 수 있었음 — 그 구멍을 막기 위해 도입.
# ---------------------------------------------------------------------

SESSION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30  # 30일


def create_session_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + SESSION_TOKEN_TTL_SECONDS}
    return jwt.encode(payload, SESSION_SECRET_KEY, algorithm="HS256")


def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, SESSION_SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="세션이 만료되었거나 올바르지 않아요. 다시 로그인해주세요.")
    return payload["sub"]


def require_admin(x_admin_key: str = Header(None)) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="ADMIN_API_KEY가 설정되지 않았습니다 (.env 확인)")
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="관리자 인증이 필요합니다.")


# 관리자 로그인(/auth/admin) 시 발급되는 특수 신원 — users 테이블에 실제 행을 만들지 않고,
# 테스트 편의를 위해 "이 세션은 어떤 매장이든 사장님 권한으로 취급"하는 용도로만 씀.
# 실제 유저 id는 Supabase가 생성하는 UUID라 "admin" 문자열과 절대 겹치지 않는다.
ADMIN_USER_ID = "admin"


def is_admin_user(user_id: str) -> bool:
    return user_id == ADMIN_USER_ID


# ---------------------------------------------------------------------
# 이미지 업로드 검증 — 파일 확장자/Content-Type은 클라이언트가 마음대로 적어 보낼 수 있어서 못 믿음.
# 실제 파일 내용 맨 앞 바이트(매직 넘버)로 진짜 이미지인지 확인하고, 용량도 상한을 둔다.
# ---------------------------------------------------------------------

MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8MB


def validate_image_bytes(contents: bytes, max_size: int = MAX_IMAGE_SIZE_BYTES) -> None:
    if len(contents) > max_size:
        raise HTTPException(status_code=413, detail=f"이미지 용량은 {max_size // (1024 * 1024)}MB 이하여야 해요.")
    header = contents[:12]
    is_image = (
        header.startswith(b"\xff\xd8\xff")  # JPEG
        or header.startswith(b"\x89PNG\r\n\x1a\n")  # PNG
        or header.startswith((b"GIF87a", b"GIF89a"))  # GIF
        or (header[:4] == b"RIFF" and header[8:12] == b"WEBP")  # WEBP
    )
    if not is_image:
        raise HTTPException(status_code=422, detail="jpg/png/gif/webp 이미지 파일만 올릴 수 있어요.")


# ---------------------------------------------------------------------
# 요청 빈도 제한 — 비밀번호 없는 레거시 로그인처럼, 계정 하나당 시도 실패 개념이 없는 엔드포인트를
# IP당 짧은 시간에 너무 많이 두드리지 못하게 막는 아주 단순한 in-memory 제한.
# ---------------------------------------------------------------------

_rate_limit_hits: dict[str, list[float]] = {}


def rate_limit(key: str, max_requests: int, window_seconds: int) -> None:
    now = time.time()
    hits = _rate_limit_hits.setdefault(key, [])
    while hits and now - hits[0] > window_seconds:
        hits.pop(0)
    if len(hits) >= max_requests:
        raise HTTPException(status_code=429, detail="요청이 너무 잦아요. 잠시 후 다시 시도해주세요.")
    hits.append(now)
