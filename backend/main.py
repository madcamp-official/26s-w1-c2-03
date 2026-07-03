import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

# .env 파일에서 비밀키 불러오기
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

app = FastAPI(title="맛짱(Matzzang) API")

# CORS: 프론트엔드(localhost:5173)에서 이 API를 호출할 수 있게 허용
# 나중에 배포하면 여기에 실제 도메인도 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase 클라이언트 (키가 있을 때만 생성 → 키 없어도 서버는 켜짐)
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# 서버가 살아있는지 확인용 (제일 먼저 이걸로 테스트)
@app.get("/health")
def health():
    return {"status": "ok", "supabase_connected": supabase is not None}


# 매장 목록 조회 — 첫 번째 진짜 엔드포인트
@app.get("/stores")
def get_stores():
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase 연결이 설정되지 않았습니다 (.env 확인)")
    result = supabase.table("stores").select("*").execute()
    return result.data
