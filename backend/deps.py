import os

from dotenv import load_dotenv
from fastapi import HTTPException
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
