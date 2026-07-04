import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")

app = FastAPI(title="맛짱(Matzzang) API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


@app.get("/health")
def health():
    return {"status": "ok", "supabase_connected": supabase is not None}


@app.get("/stores")
def get_stores():
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase 연결이 설정되지 않았습니다 (.env 확인)")
    result = supabase.table("stores").select("*").execute()
    return result.data


# ---------------------------------------------------------------------
# 매장 등록
# ---------------------------------------------------------------------

class StoreCreate(BaseModel):
    owner_id: str
    name: str
    address: str
    category: Optional[str] = None
    keywords: Optional[list[str]] = None


async def geocode_address(address: str) -> dict:
    """
    카카오 주소검색 API로 주소를 위도/경도 + 시도/구군 정보로 변환.
    region_1depth_name: 시/도 (예: '서울특별시', '대전광역시')
    region_2depth_name: 시/군/구 (예: '성동구', '유성구')
    """
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

    # 도로명 주소 우선, 없으면 지번 주소의 region 정보 사용
    region_source = doc.get("road_address") or doc.get("address") or {}
    sido = region_source.get("region_1depth_name")
    gu = region_source.get("region_2depth_name")

    return {"lat": lat, "lng": lng, "sido": sido, "gu": gu}


@app.post("/stores")
async def create_store(payload: StoreCreate):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase 연결이 설정되지 않았습니다 (.env 확인)")

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

    result = supabase.table("stores").insert(row).execute()
    return result.data[0]