import os
import uuid
import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")
KAKAO_CLIENT_SECRET = os.getenv("KAKAO_CLIENT_SECRET")  # 없어도 동작함 (선택사항)

CHECKIN_BUCKET = "checkin-photos"

app = FastAPI(title="맛짱(Matzzang) API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):5173",
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def require_supabase():
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase 연결이 설정되지 않았습니다 (.env 확인)")
    return supabase


@app.get("/health")
def health():
    return {"status": "ok", "supabase_connected": supabase is not None}


# ---------------------------------------------------------------------
# 매장
# ---------------------------------------------------------------------

@app.get("/stores")
def get_stores():
    db = require_supabase()
    result = db.table("stores").select("*").execute()
    return result.data


class StoreCreate(BaseModel):
    owner_id: str
    name: str
    address: str
    category: Optional[str] = None
    keywords: Optional[list[str]] = None


async def geocode_address(address: str) -> dict:
    if not KAKAO_REST_API_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_REST_API_KEY가 설정되지 않았습니다 (.env 확인)")

    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    params = {"query": address}

    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=headers, params=params)

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"카카오 주소 검색 실패 (status {res.status_code})")

    data = res.json()
    documents = data.get("documents", [])
    if not documents:
        raise HTTPException(status_code=400, detail=f"주소를 찾을 수 없습니다: {address}")

    doc = documents[0]
    lat = float(doc["y"])
    lng = float(doc["x"])

    region_source = doc.get("road_address") or doc.get("address") or {}
    sido = region_source.get("region_1depth_name")
    gu = region_source.get("region_2depth_name")

    return {"lat": lat, "lng": lng, "sido": sido, "gu": gu}


@app.post("/stores")
async def create_store(payload: StoreCreate):
    db = require_supabase()
    geo = await geocode_address(payload.address)

    row = {
        "owner_id": payload.owner_id,
        "name": payload.name,
        "address": payload.address,
        "category": payload.category,
        "keywords": payload.keywords,
        "lat": geo["lat"],
        "lng": geo["lng"],
        "sido": geo["sido"],
        "gu": geo["gu"],
    }

    result = db.table("stores").insert(row).execute()
    return result.data[0]


@app.get("/kakao/search-place")
async def search_place(query: str):
    """
    상호명으로 카카오 장소를 검색 (사장님 대시보드에서 매장 자동 등록용).
    주소 검색(geocode_address)과 달리 이름만 알아도 검색 가능하고,
    카테고리/전화번호까지 같이 돌려줌.
    """
    if not KAKAO_REST_API_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_REST_API_KEY가 설정되지 않았습니다 (.env 확인)")

    url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    params = {"query": query}

    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=headers, params=params)

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"카카오 장소 검색 실패 (status {res.status_code})")

    data = res.json()
    results = []
    for doc in data.get("documents", []):
        results.append({
            "kakao_place_id": doc.get("id"),
            "name": doc.get("place_name"),
            "address": doc.get("road_address_name") or doc.get("address_name"),
            "category_hint": doc.get("category_name"),  # 참고용 — 우리 카테고리 칩과 자동 매칭 안 됨, 사장님이 직접 선택
            "phone": doc.get("phone") or None,
            "lat": float(doc["y"]),
            "lng": float(doc["x"]),
        })
    return results


# ---------------------------------------------------------------------
# 로그인 / 회원가입 (기존 방식 — 간단 식별, 유지는 하되 카카오 로그인이 기본이 됨)
# ---------------------------------------------------------------------

class UserSignup(BaseModel):
    login_id: str
    nickname: str


class UserLogin(BaseModel):
    login_id: str


@app.post("/users/signup")
def signup(payload: UserSignup):
    db = require_supabase()
    existing = db.table("users").select("id").eq("login_id", payload.login_id).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디예요.")
    result = db.table("users").insert(
        {"login_id": payload.login_id, "nickname": payload.nickname}
    ).execute()
    return result.data[0]


@app.post("/users/login")
def login(payload: UserLogin):
    db = require_supabase()
    result = db.table("users").select("*").eq("login_id", payload.login_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="등록되지 않은 아이디예요. 회원가입을 먼저 해주세요.")
    return result.data[0]


# ---------------------------------------------------------------------
# 카카오 로그인 (Supabase 내장 기능 대신 직접 구현 — 이메일 동의항목 요청 안 함)
# ---------------------------------------------------------------------

class KakaoLoginRequest(BaseModel):
    code: str
    redirect_uri: str


@app.post("/auth/kakao")
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
        return existing.data[0]

    result = db.table("users").insert({"kakao_id": kakao_id, "nickname": nickname}).execute()
    return result.data[0]


# ---------------------------------------------------------------------
# 체크인 (사진 인증)
# ---------------------------------------------------------------------

@app.get("/checkins")
def get_checkins(store_id: Optional[str] = None, status: Optional[str] = None):
    db = require_supabase()
    query = db.table("checkins").select("*")
    if store_id:
        query = query.eq("store_id", store_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data


@app.post("/checkins")
async def create_checkin(
    user_id: str = Form(...),
    store_id: str = Form(...),
    purpose: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    db = require_supabase()

    contents = await file.read()
    extension = (file.filename or "jpg").split(".")[-1]
    storage_path = f"{user_id}/{uuid.uuid4()}.{extension}"

    try:
        db.storage.from_(CHECKIN_BUCKET).upload(
            storage_path,
            contents,
            {"content-type": file.content_type or "image/jpeg"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"사진 업로드 실패: {e}")

    public_url_result = db.storage.from_(CHECKIN_BUCKET).get_public_url(storage_path)
    photo_url = (
        public_url_result
        if isinstance(public_url_result, str)
        else public_url_result.get("publicUrl") or public_url_result.get("public_url")
    )

    row = {
        "user_id": user_id,
        "store_id": store_id,
        "photo_url": photo_url,
        "purpose": purpose,
        "status": "pending",
    }
    result = db.table("checkins").insert(row).execute()
    return result.data[0]


class CheckinReview(BaseModel):
    status: str  # 'approved' | 'rejected'


@app.patch("/checkins/{checkin_id}")
def review_checkin(checkin_id: str, payload: CheckinReview):
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status는 approved 또는 rejected 여야 합니다.")

    db = require_supabase()
    result = (
        db.table("checkins")
        .update({"status": payload.status, "reviewed_at": "now()"})
        .eq("id", checkin_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="체크인을 찾을 수 없습니다.")
    return result.data[0]