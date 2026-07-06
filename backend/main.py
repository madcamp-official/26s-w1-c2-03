import os
import uuid
import json
import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client
from postgrest.exceptions import APIError

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")
KAKAO_CLIENT_SECRET = os.getenv("KAKAO_CLIENT_SECRET")  # 없어도 동작함 (선택사항)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

CHECKIN_BUCKET = "checkin-photos"
BADGE_BUCKET = "badge-images"

app = FastAPI(title="맛짱(Matzzang) API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d+",
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
    categories: Optional[list[str]] = None
    keywords: Optional[list[str]] = None

MAX_STORE_KEYWORDS = 3


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
    if payload.keywords and len(payload.keywords) > MAX_STORE_KEYWORDS:
        raise HTTPException(status_code=422, detail=f"키워드는 최대 {MAX_STORE_KEYWORDS}개까지 선택할 수 있어요.")

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
        "categories": payload.categories,
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
# 카테고리 / 키워드 선택지 (관리자 페이지에서 추가 — 매장 등록/뱃지 조건 폼에서 선택지로 사용)
# ---------------------------------------------------------------------

class OptionCreate(BaseModel):
    name: str


@app.get("/categories")
def get_categories():
    db = require_supabase()
    result = safe_execute(db.table("category_options").select("*").order("name"), "카테고리 목록 조회 실패")
    return result.data


@app.post("/admin/categories")
def create_category(payload: OptionCreate):
    db = require_supabase()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="카테고리 이름을 입력해주세요.")
    result = safe_execute(db.table("category_options").insert({"name": name}), "카테고리 추가 실패 (이미 있는 이름인지 확인)")
    return result.data[0]


@app.delete("/admin/categories/{category_id}")
def delete_category(category_id: str):
    db = require_supabase()
    result = safe_execute(db.table("category_options").delete().eq("id", category_id), "카테고리 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")
    return {"deleted": True}


@app.get("/keywords")
def get_keywords():
    db = require_supabase()
    result = safe_execute(db.table("keyword_options").select("*").order("name"), "키워드 목록 조회 실패")
    return result.data


@app.post("/admin/keywords")
def create_keyword(payload: OptionCreate):
    db = require_supabase()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="키워드 이름을 입력해주세요.")
    result = safe_execute(db.table("keyword_options").insert({"name": name}), "키워드 추가 실패 (이미 있는 이름인지 확인)")
    return result.data[0]


@app.delete("/admin/keywords/{keyword_id}")
def delete_keyword(keyword_id: str):
    db = require_supabase()
    result = safe_execute(db.table("keyword_options").delete().eq("id", keyword_id), "키워드 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="키워드를 찾을 수 없습니다.")
    return {"deleted": True}


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
# 구글 로그인 (카카오 로그인과 동일한 authorization code 플로우)
# ---------------------------------------------------------------------

class GoogleLoginRequest(BaseModel):
    code: str
    redirect_uri: str


@app.post("/auth/google")
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
        return existing.data[0]

    result = db.table("users").insert({"google_id": google_id, "nickname": nickname}).execute()
    return result.data[0]


# ---------------------------------------------------------------------
# 체크인 (사진 인증)
# ---------------------------------------------------------------------

@app.get("/checkins")
def get_checkins(store_id: Optional[str] = None, user_id: Optional[str] = None, status: Optional[str] = None):
    db = require_supabase()
    # users(nickname): 사장님 화면에서 "누가 보냈는지" / stores(...): 마이페이지 방문 기록에 매장 정보 같이 보여줄 때 사용
    query = db.table("checkins").select(
        "*, users(nickname), stores(id, name, categories, keywords, address, lat, lng)"
    )
    if store_id:
        query = query.eq("store_id", store_id)
    if user_id:
        query = query.eq("user_id", user_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data


@app.get("/stores/{store_id}/ranking")
def get_store_ranking(store_id: str):
    # 매장 상세 화면의 "방문 랭킹" — 그 매장에서 승인된 체크인을 유저별로 세어 방문 횟수 내림차순으로 반환
    db = require_supabase()
    result = safe_execute(
        db.table("checkins")
        .select("user_id, users(nickname)")
        .eq("store_id", store_id)
        .eq("status", "approved"),
        "방문 랭킹 조회 실패",
    )

    counts: dict[str, int] = {}
    nicknames: dict[str, str] = {}
    for c in result.data:
        user_id = c["user_id"]
        counts[user_id] = counts.get(user_id, 0) + 1
        nicknames[user_id] = (c.get("users") or {}).get("nickname")

    ranking = [{"user_id": uid, "nickname": nicknames.get(uid), "count": count} for uid, count in counts.items()]
    ranking.sort(key=lambda r: r["count"], reverse=True)
    return ranking


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


# ---------------------------------------------------------------------
# 뱃지 (관리자 페이지에서 생성 — 조건 = (키워드|카테고리) x 방문수, 뱃지 하나에 여러 조건 AND)
# ---------------------------------------------------------------------

@app.get("/badges")
def get_badges():
    db = require_supabase()
    result = safe_execute(db.table("badges").select("*, badge_conditions(*)"), "뱃지 목록 조회 실패")
    return result.data


@app.post("/admin/badges")
async def create_badge(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    emoji: Optional[str] = Form(None),
    conditions: str = Form(...),  # JSON 문자열: [{"type":"keyword","value":"조용한","min_count":5}, ...]
    image: Optional[UploadFile] = File(None),
):
    db = require_supabase()

    try:
        condition_list = json.loads(conditions)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=422, detail="conditions는 JSON 배열이어야 합니다.")
    if not condition_list:
        raise HTTPException(status_code=422, detail="조건을 최소 1개 이상 입력해주세요.")

    image_url = None
    if image is not None:
        contents = await image.read()
        extension = (image.filename or "png").split(".")[-1]
        storage_path = f"{uuid.uuid4()}.{extension}"
        try:
            db.storage.from_(BADGE_BUCKET).upload(
                storage_path, contents, {"content-type": image.content_type or "image/png"}
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"뱃지 이미지 업로드 실패: {e}")
        public_url_result = db.storage.from_(BADGE_BUCKET).get_public_url(storage_path)
        image_url = (
            public_url_result
            if isinstance(public_url_result, str)
            else public_url_result.get("publicUrl") or public_url_result.get("public_url")
        )

    badge_result = safe_execute(
        db.table("badges").insert(
            {"name": name, "description": description, "emoji": emoji, "image_url": image_url}
        ),
        "뱃지 생성 실패",
    )
    badge = badge_result.data[0]

    condition_rows = []
    for c in condition_list:
        c_type = c.get("type")
        c_value = c.get("value")
        c_min = c.get("min_count")
        if c_type not in ("keyword", "category") or not c_value or not c_min:
            raise HTTPException(
                status_code=422, detail="조건은 type(keyword|category), value, min_count가 모두 필요해요."
            )
        option_table = "keyword_options" if c_type == "keyword" else "category_options"
        existing_option = safe_execute(
            db.table(option_table).select("id").eq("name", c_value), "선택지 확인 실패"
        )
        if not existing_option.data:
            raise HTTPException(status_code=422, detail=f"등록되지 않은 선택지예요: {c_value}")
        condition_rows.append(
            {"badge_id": badge["id"], "condition_type": c_type, "condition_value": c_value, "min_count": int(c_min)}
        )

    cond_result = safe_execute(db.table("badge_conditions").insert(condition_rows), "뱃지 조건 생성 실패")

    badge["badge_conditions"] = cond_result.data
    return badge


def _compute_earned_badges(db, user_id: str):
    # 유저의 "수락된" 체크인을 매장 정보(키워드·카테고리)와 함께 가져와 방문 횟수를 센 다음,
    # 각 뱃지가 가진 조건을 전부(AND) 만족하는지 확인한다.
    checkins_result = safe_execute(
        db.table("checkins")
        .select("*, stores(categories, keywords)")
        .eq("user_id", user_id)
        .eq("status", "approved"),
        "체크인 조회 실패",
    )

    keyword_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    for c in checkins_result.data:
        store = c.get("stores") or {}
        for kw in store.get("keywords") or []:
            keyword_counts[kw] = keyword_counts.get(kw, 0) + 1
        for category in store.get("categories") or []:
            category_counts[category] = category_counts.get(category, 0) + 1

    badges_result = safe_execute(db.table("badges").select("*, badge_conditions(*)"), "뱃지 목록 조회 실패")

    earned_badges = []
    for badge in badges_result.data:
        conditions = badge.get("badge_conditions") or []
        if not conditions:
            continue
        all_met = True
        for cond in conditions:
            counts = keyword_counts if cond["condition_type"] == "keyword" else category_counts
            if counts.get(cond["condition_value"], 0) < cond["min_count"]:
                all_met = False
                break
        earned_badges.append({**badge, "earned": all_met})

    return earned_badges


@app.get("/users/{user_id}/badges")
def get_user_badges(user_id: str):
    db = require_supabase()
    return _compute_earned_badges(db, user_id)


@app.delete("/admin/badges/{badge_id}")
def delete_badge(badge_id: str):
    db = require_supabase()
    # badge_conditions는 on delete cascade라 badges만 지우면 조건도 같이 삭제됨
    result = safe_execute(db.table("badges").delete().eq("id", badge_id), "뱃지 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="뱃지를 찾을 수 없습니다.")
    return {"deleted": True}