import re
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from deps import KAKAO_REST_API_KEY, NTS_API_KEY, STORE_THUMBNAIL_BUCKET, require_supabase, safe_execute

router = APIRouter()

# ---------------------------------------------------------------------
# 매장
# ---------------------------------------------------------------------


@router.get("/stores")
def get_stores(owner_id: Optional[str] = None, status: Optional[str] = None):
    db = require_supabase()
    query = db.table("stores").select("*")
    if owner_id:
        query = query.eq("owner_id", owner_id)
    if status:
        query = query.eq("status", status)
    elif not owner_id:
        # 손님 화면(지도/홈 등)은 owner_id도 status도 안 넘기는 기본 조회 — 승인된 매장만 보여줌
        query = query.eq("status", "approved")
    result = safe_execute(query, "매장 목록 조회 실패")
    return result.data


class StoreCreate(BaseModel):
    owner_id: str
    name: str
    address: str
    kakao_place_id: str  # 카카오 장소 검색으로 고른 실제 매장만 등록 가능 (직접 입력 매장 생성 폐지)
    business_registration_number: str  # 사업자등록번호 10자리 (국세청 진위확인용)
    business_owner_name: str  # 대표자 성명 (국세청 진위확인용)
    business_start_date: str  # 개업일자 YYYYMMDD (국세청 진위확인용)
    categories: Optional[list[str]] = None
    keywords: Optional[list[str]] = None
    image_url: Optional[str] = None  # 장소검색으로 자동 등록할 때 카카오맵 대표 이미지를 여기로 넘김


def _validate_brn_checksum(b_no: str) -> bool:
    # 사업자등록번호 자체 검증용 체크섬 — 국세청 API 호출 전에 형식 오류를 빠르게 걸러내기 위함
    if not re.fullmatch(r"\d{10}", b_no):
        return False
    digits = [int(c) for c in b_no]
    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    total = sum(d * w for d, w in zip(digits, weights))
    total += (digits[8] * 5) // 10
    return (10 - (total % 10)) % 10 == digits[9]


async def verify_business_registration(b_no: str, p_nm: str, start_dt: str) -> dict:
    # 공공데이터포털 "국세청_사업자등록정보 진위확인 및 상태조회 서비스" — 번호·대표자명·개업일자가
    # 국세청 데이터와 실제로 일치하는 사업자인지 확인 (셋 중 하나라도 다르면 valid != "01")
    if not NTS_API_KEY:
        raise HTTPException(status_code=500, detail="NTS_API_KEY가 설정되지 않았습니다 (.env 확인)")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.odcloud.kr/api/nts-businessman/v1/validate",
            params={"serviceKey": NTS_API_KEY},
            json={"businesses": [{"b_no": b_no, "start_dt": start_dt, "p_nm": p_nm}]},
        )

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"사업자등록정보 진위확인 실패: {res.text}")

    data = res.json()
    results = data.get("data") or []
    if not results:
        raise HTTPException(status_code=502, detail=f"사업자등록정보 진위확인 응답 오류: {data}")

    result = results[0]
    if result.get("valid") != "01":
        raise HTTPException(
            status_code=422,
            detail=result.get("valid_msg") or "사업자등록번호·대표자명·개업일자가 국세청 정보와 일치하지 않습니다.",
        )
    return result


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


def _normalize(text: str) -> str:
    # 중복 비교용 — 공백 차이(예: "테스트1" vs "테스트 1")를 무시하기 위해 공백을 전부 제거
    return "".join(text.split())


@router.post("/stores")
async def create_store(payload: StoreCreate):
    if payload.keywords and len(payload.keywords) > MAX_STORE_KEYWORDS:
        raise HTTPException(status_code=422, detail=f"키워드는 최대 {MAX_STORE_KEYWORDS}개까지 선택할 수 있어요.")

    name = payload.name.strip()
    address = payload.address.strip()
    b_no = re.sub(r"\D", "", payload.business_registration_number)
    p_nm = payload.business_owner_name.strip()
    start_dt = re.sub(r"\D", "", payload.business_start_date)

    if not _validate_brn_checksum(b_no):
        raise HTTPException(status_code=422, detail="사업자등록번호 형식이 올바르지 않습니다 (10자리 숫자 확인).")
    if not p_nm:
        raise HTTPException(status_code=422, detail="대표자 성명을 입력해주세요.")
    if not re.fullmatch(r"\d{8}", start_dt):
        raise HTTPException(status_code=422, detail="개업일자는 YYYYMMDD 형식으로 입력해주세요.")

    db = require_supabase()

    # 중복 등록 차단 (반려된 신청은 재신청할 수 있게 제외)
    # 1순위: 카카오 장소 ID로 비교 — 카카오맵상 실제로 같은 장소인지 정확히 판별
    # 2순위: 이름·주소를 공백 무시하고 비교 (표기 차이 방지)
    existing = safe_execute(
        db.table("stores").select("id, name, address, kakao_place_id").neq("status", "rejected"),
        "중복 매장 확인 실패",
    )
    for store in existing.data:
        if store.get("kakao_place_id") == payload.kakao_place_id:
            raise HTTPException(status_code=409, detail="이미 등록(신청)된 매장이에요 (카카오맵상 동일 장소).")
        if _normalize(store["name"]) == _normalize(name) and _normalize(store["address"]) == _normalize(address):
            raise HTTPException(status_code=409, detail="이미 등록(신청)된 매장이에요 (같은 이름·주소).")

    # 국세청 사업자등록정보 진위확인 — 번호·대표자명·개업일자가 실제로 일치해야 통과 (여기서 걸러지지 않으면 관리자 심사로 넘어감)
    await verify_business_registration(b_no, p_nm, start_dt)

    geo = await geocode_address(address)

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
        "name": name,
        "address": address,
        "categories": payload.categories,
        "keywords": payload.keywords,
        "image_url": payload.image_url,
        "kakao_place_id": payload.kakao_place_id,
        "business_registration_number": b_no,
        "business_owner_name": p_nm,
        "business_start_date": start_dt,
        "status": "pending",  # 국세청 진위확인을 통과해도 관리자 최종 승인 전까지는 손님 화면에 노출 안 됨
        "lat": geo["lat"],
        "lng": geo["lng"],
        "sido": geo["sido"],
        "gu": geo["gu"],
    }

    result = db.table("stores").insert(row).execute()
    return result.data[0]


class StoreReview(BaseModel):
    status: str  # approved | rejected


@router.patch("/stores/{store_id}/review")
def review_store(store_id: str, payload: StoreReview):
    # 관리자 — 사업자 진위확인을 통과한 매장 등록 신청을 최종 승인/반려
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status는 approved 또는 rejected여야 합니다.")
    db = require_supabase()
    result = safe_execute(
        db.table("stores").update({"status": payload.status}).eq("id", store_id), "매장 심사 처리 실패"
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="매장을 찾을 수 없습니다.")
    return result.data[0]


@router.post("/stores/{store_id}/thumbnail")
async def upload_store_thumbnail(store_id: str, image: UploadFile = File(...)):
    # 사장님이 매장 등록 후(또는 나중에) 직접 썸네일을 올릴 때 사용 — 장소검색 자동 이미지를 덮어씀
    db = require_supabase()
    contents = await image.read()
    extension = (image.filename or "jpg").split(".")[-1]
    storage_path = f"{store_id}/{uuid.uuid4()}.{extension}"

    try:
        db.storage.from_(STORE_THUMBNAIL_BUCKET).upload(
            storage_path, contents, {"content-type": image.content_type or "image/jpeg"}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"매장 썸네일 업로드 실패: {e}")

    public_url_result = db.storage.from_(STORE_THUMBNAIL_BUCKET).get_public_url(storage_path)
    image_url = (
        public_url_result
        if isinstance(public_url_result, str)
        else public_url_result.get("publicUrl") or public_url_result.get("public_url")
    )

    result = safe_execute(
        db.table("stores").update({"image_url": image_url}).eq("id", store_id), "매장 썸네일 저장 실패"
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="매장을 찾을 수 없습니다.")
    return result.data[0]


@router.get("/kakao/search-place")
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
            "place_url": doc.get("place_url"),  # 카카오맵 상세 페이지 — 대표 이미지 자동으로 가져올 때 사용
            "lat": float(doc["y"]),
            "lng": float(doc["x"]),
        })
    return results


@router.get("/kakao/place-image")
async def get_place_image(place_url: str):
    """
    카카오맵 장소 상세 페이지에서 대표 이미지(og:image) 하나만 가져옴.
    별도 이미지 API가 없어서, 그 페이지에 이미 박혀 있는 og:image 메타태그를 그대로 읽어옴
    (사장님이 매장 검색으로 자동 등록할 때, 등록 안 해도 대표 사진 하나는 채워주기 위함).
    """
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=5) as client:
            res = await client.get(place_url, headers={"User-Agent": "Mozilla/5.0"})
    except httpx.HTTPError:
        return {"image_url": None}

    if res.status_code != 200:
        return {"image_url": None}

    match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', res.text)
    if not match:
        return {"image_url": None}
    image_url = match.group(1)
    if image_url.startswith("//"):  # 프로토콜 생략 URL은 https로 고정
        image_url = f"https:{image_url}"
    return {"image_url": image_url}


@router.get("/stores/{store_id}/ranking")
def get_store_ranking(store_id: str):
    # 매장 상세 화면의 "방문 랭킹" — 그 매장에서 승인된 체크인을 유저별로 세어 방문 횟수 내림차순으로 반환
    db = require_supabase()
    result = safe_execute(
        db.table("checkins")
        .select("user_id, users(nickname, profile_image_url)")
        .eq("store_id", store_id)
        .eq("status", "approved"),
        "방문 랭킹 조회 실패",
    )

    counts: dict[str, int] = {}
    nicknames: dict[str, str] = {}
    profile_images: dict[str, str] = {}
    for c in result.data:
        user_id = c["user_id"]
        counts[user_id] = counts.get(user_id, 0) + 1
        nicknames[user_id] = (c.get("users") or {}).get("nickname")
        profile_images[user_id] = (c.get("users") or {}).get("profile_image_url")

    ranking = [
        {
            "user_id": uid,
            "nickname": nicknames.get(uid),
            "profile_image_url": profile_images.get(uid),
            "count": count,
        }
        for uid, count in counts.items()
    ]
    ranking.sort(key=lambda r: r["count"], reverse=True)
    return ranking


@router.get("/stores/{store_id}/photos")
def get_store_photos(store_id: str):
    # 매장 상세 화면의 "손님이 보낸 사진" 갤러리 — 승인됐고, 손님이 공개에 동의한 체크인 사진만 최신순으로
    db = require_supabase()
    result = safe_execute(
        db.table("checkins")
        .select("photo_url, purpose, created_at, users(nickname)")
        .eq("store_id", store_id)
        .eq("status", "approved")
        .eq("photo_consent", True)
        .order("created_at", desc=True),
        "매장 사진 조회 실패",
    )
    return [
        {
            "photo_url": c["photo_url"],
            "purpose": c["purpose"],
            "created_at": c["created_at"],
            "nickname": (c.get("users") or {}).get("nickname"),
        }
        for c in result.data
    ]
