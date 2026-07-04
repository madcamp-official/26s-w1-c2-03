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
    # 로컬 개발 중엔 5173번이 이미 사용 중이면 Vite가 5174, 5175...로 자동으로 옮겨감.
    # 매번 여기 포트를 손대지 않도록 정규식으로 localhost의 모든 포트를 허용.
    allow_origin_regex=r"http://localhost:\d+",
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


def safe_execute(query, error_message="요청 처리에 실패했습니다"):
    # Supabase 쿼리 실행 중 처리 안 된 예외가 나면 CORS 헤더 없는 500이 되어
    # 브라우저에 "Failed to fetch"로만 보임 → 항상 detail이 담긴 HTTPException으로 변환.
    try:
        return query.execute()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{error_message}: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "supabase_connected": supabase is not None}


# ---------------------------------------------------------------------
# 매장
# ---------------------------------------------------------------------

@app.get("/stores")
def get_stores(owner_id: Optional[str] = None):
    db = require_supabase()
    query = db.table("stores").select("*")
    if owner_id:
        query = query.eq("owner_id", owner_id)
    result = safe_execute(query, "매장 목록 조회 실패")
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

    # owner_id는 이제 카카오로 로그인한 users.id를 그대로 씀 (별도 사장님 회원가입 없음).
    # stores.owner_id는 owners 테이블을 참조하므로, 아직 owners에 같은 id가 없으면 먼저 만들어줌
    # (owners는 email/name 등은 비워두고 사실상 users와 같은 id를 쓰는 그림자 테이블로 사용).
    existing_owner = safe_execute(
        db.table("owners").select("id").eq("id", payload.owner_id), "사장님 확인 실패"
    )
    if not existing_owner.data:
        safe_execute(db.table("owners").insert({"id": payload.owner_id}), "사장님 등록 실패")

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

    result = safe_execute(db.table("stores").insert(row), "매장 등록 실패 (owner_id가 owners 테이블에 있는지 확인)")
    return result.data[0]


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
    existing = safe_execute(
        db.table("users").select("id").eq("login_id", payload.login_id), "아이디 중복 확인 실패"
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디예요.")
    result = safe_execute(
        db.table("users").insert({"login_id": payload.login_id, "nickname": payload.nickname}),
        "회원가입 실패",
    )
    return result.data[0]


@app.post("/users/login")
def login(payload: UserLogin):
    db = require_supabase()
    result = safe_execute(
        db.table("users").select("*").eq("login_id", payload.login_id), "로그인 조회 실패"
    )
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
    existing = safe_execute(db.table("users").select("*").eq("kakao_id", kakao_id), "카카오 회원 조회 실패")
    if existing.data:
        return existing.data[0]

    result = safe_execute(
        db.table("users").insert({"kakao_id": kakao_id, "nickname": nickname}), "카카오 회원 생성 실패"
    )
    return result.data[0]


# ---------------------------------------------------------------------
# 체크인 (사진 인증)
# ---------------------------------------------------------------------

@app.get("/checkins")
def get_checkins(store_id: Optional[str] = None, status: Optional[str] = None):
    db = require_supabase()
    # users(nickname)으로 함께 조회 → 사장님 화면에 "누가 보냈는지" 같이 보여줄 수 있음
    query = db.table("checkins").select("*, users(nickname)")
    if store_id:
        query = query.eq("store_id", store_id)
    if status:
        query = query.eq("status", status)
    result = safe_execute(query.order("created_at", desc=True), "체크인 목록 조회 실패")
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
    result = safe_execute(db.table("checkins").insert(row), "체크인 등록 실패")
    return result.data[0]


class CheckinReview(BaseModel):
    status: str  # 'approved' | 'rejected'


@app.patch("/checkins/{checkin_id}")
def review_checkin(checkin_id: str, payload: CheckinReview):
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status는 approved 또는 rejected 여야 합니다.")

    db = require_supabase()
    result = safe_execute(
        db.table("checkins")
        .update({"status": payload.status, "reviewed_at": "now()"})
        .eq("id", checkin_id),
        "체크인 처리 실패",
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="체크인을 찾을 수 없습니다.")
    return result.data[0]