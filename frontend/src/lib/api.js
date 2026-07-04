// FastAPI 백엔드 호출 전용 모듈
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

async function requestJSON(path, options = {}) {
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

async function requestForm(path, formData) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: "POST", body: formData })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `요청 실패: ${res.status}`)
  }
  return res.json()
}

export function checkHealth() {
  return requestJSON("/health")
}

export function getStores() {
  return requestJSON("/stores")
}

// 기존 간단 로그인 방식 (카카오 로그인 도입 후에도 백업용으로 남겨둠)
export function signupUser({ loginId, nickname }) {
  return requestJSON("/users/signup", {
    method: "POST",
    body: JSON.stringify({ login_id: loginId, nickname }),
  })
}

export function loginUser({ loginId }) {
  return requestJSON("/users/login", {
    method: "POST",
    body: JSON.stringify({ login_id: loginId }),
  })
}

// 카카오 로그인 — 인가 코드를 백엔드로 넘겨서 최종 로그인 처리
export function loginWithKakao({ code, redirectUri }) {
  return requestJSON("/auth/kakao", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
}

export function createCheckin({ userId, storeId, purpose, photoFile }) {
  const formData = new FormData()
  formData.append("user_id", userId)
  formData.append("store_id", storeId)
  if (purpose) formData.append("purpose", purpose)
  formData.append("file", photoFile)
  return requestForm("/checkins", formData)
}

// 매장 등록 (사장님 대시보드용) — 주소는 백엔드에서 카카오 API로 좌표/시도/구군 자동 변환됨
export function createStore({ ownerId, name, address, category, keywords }) {
  return requestJSON("/stores", {
    method: "POST",
    body: JSON.stringify({
      owner_id: ownerId,
      name,
      address,
      category,
      keywords,
    }),
  })
}

// 체크인 목록 조회 (사장님 대시보드에서 승인 대기 목록 볼 때 사용)
export function getCheckins({ storeId, status } = {}) {
  const params = new URLSearchParams()
  if (storeId) params.set("store_id", storeId)
  if (status) params.set("status", status)
  const query = params.toString() ? `?${params.toString()}` : ""
  return requestJSON(`/checkins${query}`)
}

// 체크인 승인/거절
export function reviewCheckin({ checkinId, status }) {
  return requestJSON(`/checkins/${checkinId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}