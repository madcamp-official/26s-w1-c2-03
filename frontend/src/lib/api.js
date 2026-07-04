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