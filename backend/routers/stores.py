import asyncio
import base64
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
    # 손님 화면은 이제 이 API로 매장을 찾지 않음 — /kakao/nearby-places, /kakao/search-place로 카카오 데이터를
    # 직접 보여주고, 매장을 열 때 /stores/resolve로 우리 DB 행을 만들거나 찾아옴.
    # 이 API는 사장님 대시보드(owner_id로 내 매장 전체 조회)와 관리자 승인 목록(status로 조회)에서만 사용.
    db = require_supabase()
    query = db.table("stores").select("*")
    if owner_id:
        query = query.eq("owner_id", owner_id)
    if status:
        query = query.eq("status", status)
    result = safe_execute(query, "매장 목록 조회 실패")
    return result.data


@router.get("/stores/visit-counts")
def get_store_visit_counts():
    """모든 매장의 누적 방문자 수(승인된 체크인을 남긴 distinct 유저 수) — 홈 화면 '방문자순' 정렬에 사용."""
    db = require_supabase()
    result = safe_execute(
        db.table("checkins").select("store_id, user_id").eq("status", "approved"),
        "매장 방문자 수 조회 실패",
    )
    visitors: dict[str, set] = {}
    for c in result.data:
        visitors.setdefault(c["store_id"], set()).add(c["user_id"])
    return {store_id: len(users) for store_id, users in visitors.items()}


class StoreResolve(BaseModel):
    kakao_place_id: str
    name: str
    address: str
    lat: float
    lng: float
    image_url: Optional[str] = None


@router.post("/stores/resolve")
def resolve_store(payload: StoreResolve):
    """
    손님이 카카오 검색/주변 결과에서 매장을 열람(상세보기·체크인)할 때 호출.
    우리 DB에 이미 있으면 그대로 반환하고, 없으면 사장님 인증 전 "미인증(unclaimed)" 상태로 새로 만들어서
    스탬프·랭킹·뱃지 같은 게임 기능이 사장님 등록 여부와 무관하게 바로 동작하게 함.
    """
    db = require_supabase()
    existing = safe_execute(
        db.table("stores").select("*").eq("kakao_place_id", payload.kakao_place_id), "매장 조회 실패"
    )
    if existing.data:
        store = existing.data[0]
        # 예전에 이미지 없이 만들어진 매장이면, 이번에 넘어온 카카오 썸네일로 채워줌(백필).
        # 이미 이미지가 있으면(사장님이 올렸거나 전에 채워졌으면) 건드리지 않음.
        if not store.get("image_url") and payload.image_url:
            updated = safe_execute(
                db.table("stores").update({"image_url": payload.image_url}).eq("id", store["id"]),
                "매장 이미지 갱신 실패",
            )
            return updated.data[0]
        return store

    row = {
        "name": payload.name.strip(),
        "address": payload.address.strip(),
        "kakao_place_id": payload.kakao_place_id,
        "image_url": payload.image_url,
        "status": "unclaimed",
        "lat": payload.lat,
        "lng": payload.lng,
    }
    result = safe_execute(db.table("stores").insert(row), "매장 생성 실패")
    return result.data[0]


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


@router.post("/stores")
async def create_store(payload: StoreCreate):
    """
    매장 "인증" 신청 — 카카오 장소검색으로 고른 실제 매장에 사업자등록정보로 소유권을 주장.
    이제 매장 노출 여부와는 무관함(손님은 /kakao/nearby-places, /kakao/search-place로 이미 다 볼 수 있음).
    이 신청은 오직 "체크인 승인/리워드 설정 같은 운영 권한을 이 사장님에게 줄지"만 결정함.
    """
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

    # 손님이 먼저 열람해서 "미인증" 상태로 이미 만들어져 있을 수도 있고, 처음 인증하는 매장일 수도 있음.
    existing = safe_execute(
        db.table("stores").select("id, owner_id, status").eq("kakao_place_id", payload.kakao_place_id),
        "매장 조회 실패",
    )
    existing_store = existing.data[0] if existing.data else None
    if existing_store and existing_store["status"] in ("pending", "approved") and existing_store["owner_id"] != payload.owner_id:
        raise HTTPException(status_code=409, detail="이미 다른 사장님이 인증했거나 심사 중인 매장이에요.")

    # 국세청 사업자등록정보 진위확인 — 번호·대표자명·개업일자가 실제로 일치해야 통과
    await verify_business_registration(b_no, p_nm, start_dt)

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
        "kakao_place_id": payload.kakao_place_id,
        "business_registration_number": b_no,
        "business_owner_name": p_nm,
        "business_start_date": start_dt,
        "status": "pending",  # 관리자 최종 승인 전까지 체크인 승인·리워드 설정 같은 운영 권한만 보류됨 (노출은 이미 되고 있음)
    }
    if payload.image_url:
        row["image_url"] = payload.image_url

    if existing_store:
        result = safe_execute(db.table("stores").update(row).eq("id", existing_store["id"]), "매장 인증 신청 실패")
    else:
        geo = await geocode_address(address)
        row.update({"lat": geo["lat"], "lng": geo["lng"], "sido": geo["sido"], "gu": geo["gu"]})
        result = safe_execute(db.table("stores").insert(row), "매장 인증 신청 실패")

    return result.data[0]


class StoreReview(BaseModel):
    status: str  # approved | rejected


@router.patch("/stores/{store_id}/review")
def review_store(store_id: str, payload: StoreReview):
    # 관리자 — 사업자 진위확인을 통과한 인증 신청을 최종 승인/반려
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status는 approved 또는 rejected여야 합니다.")
    db = require_supabase()
    if payload.status == "approved":
        update_row = {"status": "approved"}
    else:
        # 반려되면 소유권 정보를 지우고 미인증 상태로 되돌려서 다른 사장님도 다시 신청할 수 있게 함
        update_row = {
            "status": "unclaimed",
            "owner_id": None,
            "business_registration_number": None,
            "business_owner_name": None,
            "business_start_date": None,
        }
    result = safe_execute(db.table("stores").update(update_row).eq("id", store_id), "매장 심사 처리 실패")
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


# 카카오가 주는 category_group_code는 음식점(FD6)/카페(CE7) 딱 두 종류뿐이라 필터로 쓰기엔 너무 뭉뚱그려짐.
# 대신 훨씬 자세한 category_name(예: "음식점 > 한식 > 국수", "카페 > 디저트카페")을 파싱해서
# 손님 화면에서 쓸 대분류(한식/중식/일식/양식/분식/치킨/주점/카페/디저트/기타)로 정규화한다.
#
# 아래 목록은 위에서부터 순서대로 "키워드가 category_name 안에 있으면 그 카테고리로" 매칭한다.
# 대분류(한식/일식 등)뿐 아니라 세부 업종(라멘/짜장/족발 등)까지 폭넓게 잡아 '기타'로 새는 걸 줄임.
# 한식은 워낙 종류가 많아 맨 아래에 두고(다른 카테고리부터 먼저 걸러지게), 여러 카테고리에 걸릴 수 있는
# 애매한 키워드는 넣지 않음.
_FOOD_CATEGORY_KEYWORDS = [
    # 치킨
    ("치킨", "치킨"),
    ("닭강정", "치킨"),
    # 분식
    ("분식", "분식"),
    ("떡볶이", "분식"),
    ("김밥", "분식"),
    ("순대", "분식"),
    # 주점
    ("술집", "주점"),
    ("호프", "주점"),
    ("주점", "주점"),
    ("포장마차", "주점"),
    ("이자카야", "주점"),
    ("와인바", "주점"),
    ("칵테일", "주점"),
    # 일식
    ("일식", "일식"),
    ("일본", "일식"),
    ("초밥", "일식"),
    ("스시", "일식"),
    ("사시미", "일식"),
    ("돈까스", "일식"),
    ("돈가스", "일식"),
    ("라멘", "일식"),
    ("우동", "일식"),
    ("소바", "일식"),
    ("규동", "일식"),
    ("오마카세", "일식"),
    ("텐동", "일식"),
    # 중식
    ("중식", "중식"),
    ("중국", "중식"),
    ("중화", "중식"),
    ("짜장", "중식"),
    ("짬뽕", "중식"),
    ("마라", "중식"),
    ("훠궈", "중식"),
    ("양꼬치", "중식"),
    ("딤섬", "중식"),
    # 양식
    ("양식", "양식"),
    ("이탈리", "양식"),
    ("파스타", "양식"),
    ("피자", "양식"),
    ("스테이크", "양식"),
    ("프렌치", "양식"),
    ("햄버거", "양식"),
    ("버거", "양식"),
    ("멕시", "양식"),
    ("브런치", "양식"),
    ("스페인", "양식"),
    ("샐러드", "양식"),
    ("패스트푸드", "양식"),
    # 한식 (범위가 넓어 맨 마지막)
    ("한식", "한식"),
    ("국밥", "한식"),
    ("백반", "한식"),
    ("찌개", "한식"),
    ("전골", "한식"),
    ("삼겹살", "한식"),
    ("고기", "한식"),
    ("갈비", "한식"),
    ("곱창", "한식"),
    ("막창", "한식"),
    ("냉면", "한식"),
    ("국수", "한식"),
    ("족발", "한식"),
    ("보쌈", "한식"),
    ("닭갈비", "한식"),
    ("찜닭", "한식"),
    ("해장국", "한식"),
    ("설렁탕", "한식"),
    ("추어탕", "한식"),
    ("한정식", "한식"),
    ("쌈밥", "한식"),
    ("두부", "한식"),
    ("횟집", "한식"),
    ("물회", "한식"),
    ("육회", "한식"),
    ("해물", "한식"),
    ("해산물", "한식"),
]


def _derive_category(category_name: Optional[str], group_code: Optional[str]) -> str:
    name = category_name or ""
    # 베이커리·디저트류는 그룹 무관하게 디저트로 (카페 밑이든 "음식점 > 간식 > 제과,베이커리"든)
    if any(k in name for k in ("베이커리", "제과", "디저트", "도넛", "케이크", "빙수", "아이스크림", "한과")):
        return "디저트"
    # 카페 계열 (CE7 그룹이거나 경로에 '카페'가 있음)
    if group_code == "CE7" or "카페" in name:
        return "카페"
    # 음식점 계열 — 위 목록을 순서대로 훑어 첫 매칭 카테고리로
    for keyword, category in _FOOD_CATEGORY_KEYWORDS:
        if keyword in name:
            return category
    return "기타"


def _normalize_kakao_doc(doc: dict) -> dict:
    group_code = doc.get("category_group_code") or None
    return {
        "kakao_place_id": doc.get("id"),
        "name": doc.get("place_name"),
        "address": doc.get("road_address_name") or doc.get("address_name"),
        "category_hint": doc.get("category_name"),
        "category_group_code": group_code,  # FD6(음식점) / CE7(카페) — 원본 그룹 코드 (호환용)
        "category": _derive_category(doc.get("category_name"), group_code),  # 손님 화면 세분화 필터용 대분류
        "phone": doc.get("phone") or None,
        "place_url": doc.get("place_url"),  # 카카오맵 상세 페이지 — 대표 이미지 자동으로 가져올 때 사용
        "lat": float(doc["y"]),
        "lng": float(doc["x"]),
    }


_FOOD_GROUP_CODES = {"FD6", "CE7"}  # 음식점 / 카페 — 유적지·관광명소·공공기관 등 비매장 결과를 걸러내는 기준


@router.get("/kakao/search-place")
async def search_place(query: str, lat: Optional[float] = None, lng: Optional[float] = None, radius: Optional[int] = None):
    """
    상호명으로 카카오 장소를 검색. lat/lng(+radius, 미터)를 같이 넘기면 그 주변으로 결과를 좁힘.
    사장님 대시보드(지역 선택 후 검색)와 손님 화면(위치 기반 검색) 양쪽에서 재사용.
    카카오 키워드 검색은 지명이 들어가면 유적지·관광명소 같은 음식점 아닌 결과도 섞여 나오므로,
    category_group_code가 음식점(FD6)/카페(CE7)인 결과만 남긴다.
    """
    if not KAKAO_REST_API_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_REST_API_KEY가 설정되지 않았습니다 (.env 확인)")

    url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    params = {"query": query}
    if lat is not None and lng is not None:
        params["x"] = lng
        params["y"] = lat
        if radius:
            params["radius"] = max(1, min(radius, 20000))

    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=headers, params=params)

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"카카오 장소 검색 실패 (status {res.status_code})")

    docs = res.json().get("documents", [])
    return [
        _normalize_kakao_doc(doc)
        for doc in docs
        if doc.get("category_group_code") in _FOOD_GROUP_CODES
    ]


async def _kakao_category_search(category_group_code: str, lat: float, lng: float, radius: int, pages: int = 1) -> list[dict]:
    # 카카오 카테고리 검색은 한 페이지 15개, 최대 3페이지(45개)까지만 넘겨줌
    url = "https://dapi.kakao.com/v2/local/search/category.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    docs: list[dict] = []
    async with httpx.AsyncClient() as client:
        for page in range(1, pages + 1):
            params = {"category_group_code": category_group_code, "x": lng, "y": lat, "radius": radius, "sort": "distance", "size": 15, "page": page}
            res = await client.get(url, headers=headers, params=params)
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"카카오 주변 매장 조회 실패 (status {res.status_code})")
            data = res.json()
            docs += data.get("documents", [])
            if data.get("meta", {}).get("is_end"):
                break
    return docs


async def _kakao_keyword_search(query: str, lat: float, lng: float, radius: int, pages: int = 1) -> list[dict]:
    # 상호·업종 키워드 검색. 카테고리 칩을 눌렀을 때 그 업종 매장을 넉넉히(최대 45개) 모으는 용도로도 사용
    url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    docs: list[dict] = []
    async with httpx.AsyncClient() as client:
        for page in range(1, pages + 1):
            params = {"query": query, "sort": "distance", "size": 15, "page": page}
            if lat is not None and lng is not None:
                params["x"] = lng
                params["y"] = lat
                if radius:
                    params["radius"] = max(1, min(radius, 20000))
            res = await client.get(url, headers=headers, params=params)
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"카카오 장소 검색 실패 (status {res.status_code})")
            data = res.json()
            docs += data.get("documents", [])
            if data.get("meta", {}).get("is_end"):
                break
    return docs


# 손님 화면 카테고리 칩 -> 카카오 키워드 검색어 (주점은 '주점'보다 '술집'이 결과가 훨씬 많음)
_CATEGORY_SEARCH_QUERY = {
    "한식": "한식",
    "중식": "중식",
    "일식": "일식",
    "양식": "양식",
    "분식": "분식",
    "치킨": "치킨",
    "주점": "술집",
    "카페": "카페",
    "디저트": "디저트",
}


@router.get("/kakao/nearby-places")
async def get_nearby_places(lat: float, lng: float, radius: int = 3000, category: Optional[str] = None):
    """
    현재 위치 반경 내 실제 매장을 카카오맵에서 바로 가져옴.
    - category 없음(전체): 음식점 FD6 + 카페 CE7을 거리순으로(각 2페이지=최대 60개).
    - category 지정(한식/일식 등): 그 업종을 키워드로 직접 검색(최대 45개)해서, 파생 카테고리가
      정확히 일치하는 매장만 반환. 반경 내 매장이 수백 개라 카테고리 필터를 프론트에서 하면
      먼저 로드된 몇십 개 안에서만 걸리는 문제가 있어, 카테고리별 조회는 서버에서 직접 처리함.
    radius 단위는 미터, 최대 20km.
    """
    if not KAKAO_REST_API_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_REST_API_KEY가 설정되지 않았습니다 (.env 확인)")
    radius = max(1, min(radius, 20000))

    # 특정 카테고리: 그 업종을 키워드로 넉넉히 모아서 파생 카테고리가 정확히 맞는 것만
    if category and category in _CATEGORY_SEARCH_QUERY:
        docs = await _kakao_keyword_search(_CATEGORY_SEARCH_QUERY[category], lat, lng, radius, pages=3)
        seen = set()
        results = []
        for doc in docs:
            place_id = doc.get("id")
            if place_id in seen:
                continue
            seen.add(place_id)
            norm = _normalize_kakao_doc(doc)
            if norm["category"] == category:  # 키워드 검색 노이즈(예: '치킨호프'는 주점) 제거
                results.append(norm)
        return results

    # 전체: 음식점 + 카페를 거리순으로 (각 2페이지)
    food_docs, cafe_docs = await asyncio.gather(
        _kakao_category_search("FD6", lat, lng, radius, pages=2),
        _kakao_category_search("CE7", lat, lng, radius, pages=2),
    )

    seen = set()
    results = []
    for doc in food_docs + cafe_docs:
        place_id = doc.get("id")
        if place_id in seen:
            continue
        seen.add(place_id)
        results.append(_normalize_kakao_doc(doc))
    return results


# 같은 place_url을 손님마다·화면 이동마다 반복 스크래핑하지 않도록 서버 메모리에 결과를 캐싱.
# (실패(None)도 캐싱해서 죽은 페이지를 매번 다시 때리지 않게 함)
_place_image_cache: dict[str, Optional[str]] = {}


async def _scrape_og_image(place_url: str) -> Optional[str]:
    if place_url in _place_image_cache:
        return _place_image_cache[place_url]

    image_url = None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=5) as client:
            res = await client.get(place_url, headers={"User-Agent": "Mozilla/5.0"})
        if res.status_code == 200:
            match = re.search(
                r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', res.text
            )
            if match:
                image_url = match.group(1)
                if image_url.startswith("//"):  # 프로토콜 생략 URL은 https로 고정
                    image_url = f"https:{image_url}"
    except httpx.HTTPError:
        image_url = None

    _place_image_cache[place_url] = image_url
    return image_url


# 위장 지도 캡처/공유 시, 카카오 썸네일을 canvas로 그리면 CORS 때문에 canvas가 오염되어 PNG 추출이 막힘.
# 그래서 서버가 이미지를 대신 받아 base64 data URL로 돌려주고, 프론트가 그걸 SVG에 인라인해서 캡처함.
_image_data_cache: dict[str, str] = {}


@router.get("/kakao/image-data")
async def get_image_data(url: str):
    if url in _image_data_cache:
        return {"data_url": _image_data_cache[url]}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8) as client:
            res = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="이미지를 불러오지 못했습니다.")
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="이미지를 불러오지 못했습니다.")
    ctype = res.headers.get("content-type", "image/jpeg").split(";")[0]
    data_url = f"data:{ctype};base64,{base64.b64encode(res.content).decode()}"
    if len(_image_data_cache) < 500:  # 메모리 보호용 상한
        _image_data_cache[url] = data_url
    return {"data_url": data_url}


@router.get("/kakao/place-image")
async def get_place_image(place_url: str):
    """
    카카오맵 장소 상세 페이지에서 대표 이미지(og:image) 하나만 가져옴.
    별도 이미지 API가 없어서, 그 페이지에 이미 박혀 있는 og:image 메타태그를 그대로 읽어옴
    (사장님이 매장 검색으로 자동 등록할 때, 등록 안 해도 대표 사진 하나는 채워주기 위함).
    """
    return {"image_url": await _scrape_og_image(place_url)}


class PlaceImagesRequest(BaseModel):
    place_urls: list[str]


@router.post("/kakao/place-images")
async def get_place_images(payload: PlaceImagesRequest):
    """
    손님 화면(홈/지도) 목록의 여러 매장 썸네일을 한 번에 가져옴.
    각 카카오맵 상세 페이지 og:image를 동시성 제한(최대 8개)으로 병렬 스크래핑하고,
    찾은 것만 { place_url: image_url } 형태로 돌려줌 (못 찾은 건 프론트에서 이모지로 대체).
    """
    urls = list(dict.fromkeys(u for u in payload.place_urls if u))[:60]  # 중복 제거 + 안전 상한
    semaphore = asyncio.Semaphore(8)

    async def fetch_one(url: str) -> tuple[str, Optional[str]]:
        async with semaphore:
            return url, await _scrape_og_image(url)

    pairs = await asyncio.gather(*[fetch_one(u) for u in urls])
    return {url: image for url, image in pairs if image}


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
