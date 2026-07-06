from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from deps import supabase
from routers import auth, badges, checkins, options, rewards, stores

app = FastAPI(title="맛짱(Matzzang) API")

app.add_middleware(
    CORSMiddleware,
    # 로컬 개발 중엔 5173번이 이미 사용 중이면 Vite가 5174, 5175...로 자동으로 옮겨감.
    # 매번 여기 포트를 손대지 않도록 정규식으로 localhost/사설 IP의 모든 포트를 허용.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d+",
    # VM 서버에 배포한 프론트엔드 주소 (정규식 패턴에 안 걸리는 고정 도메인이라 별도로 명시)
    allow_origins=["https://matzzang.for20wgh0514.madcamp-kaist.org"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stores.router)
app.include_router(options.router)
app.include_router(auth.router)
app.include_router(checkins.router)
app.include_router(badges.router)
app.include_router(rewards.router)


@app.get("/health")
def health():
    return {"status": "ok", "supabase_connected": supabase is not None}
