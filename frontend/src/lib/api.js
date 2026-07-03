// FastAPI 백엔드 호출 전용 모듈
// 로컬 개발: http://localhost:8000
// VM 배포 후: .env 의 VITE_API_BASE_URL 만 바꾸면 전체 앱이 새 서버를 바라봄
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `요청 실패: ${res.status}`)
  }

  return res.json()
}

// 매장 목록 조회
export function getStores() {
  return request("/stores")
}

// 서버 상태 확인 (헬스체크)
export function checkHealth() {
  return request("/health")
}