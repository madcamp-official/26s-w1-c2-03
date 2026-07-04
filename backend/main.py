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


async def geocode_address(address: str) -> tuple[float, float]:
    """카카오 주소검색 API로 주소를 위도/경도로 변환"""
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

    # 첫 번째 검색 결과 사용
    doc = documents[0]
    lat = float(doc["y"])
    lng = float(doc["x"])
    return lat, lng


@app.post("/stores")
async def create_store(payload: StoreCreate):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase 연결이 설정되지 않았습니다 (.env 확인)")

    lat, lng = await geocode_address(payload.address)

    row = {
        "owner_id": payload.owner_id,
        "name": payload.name,
        "address": payload.address,
        "category": payload.category,
        "keywords": payload.keywords,
        "lat": lat,
        "lng": lng,
    }

    try:
        result = supabase.table("stores").insert(row).execute()
    except Exception as e:
        # 처리 안 된 예외를 그대로 두면 500 응답에 CORS 헤더가 안 붙어
        # 브라우저에서 진짜 에러 메시지 대신 "Failed to fetch"만 보이게 됨.
        # DB 에러 메시지를 그대로 노출하지 않고, 흔한 경우만 안내 메시지로 변환.
        message = str(e)
        if "owner_id" in message and "not present" in message:
            detail = "존재하지 않는 사장님 ID입니다. owners 테이블에 등록된 id를 사용하세요."
        else:
            detail = "매장 등록에 실패했습니다."
        raise HTTPException(status_code=400, detail=detail)

    return result.data[0]