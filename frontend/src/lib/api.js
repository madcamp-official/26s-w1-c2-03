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

export function getStores({ ownerId } = {}) {
  const params = new URLSearchParams()
  if (ownerId) params.set("owner_id", ownerId)
  const query = params.toString() ? `?${params.toString()}` : ""
  return requestJSON(`/stores${query}`)
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

// 체크인 목록 조회 (사장님 대시보드의 승인 대기 목록 / 마이페이지의 내 방문 기록에서 사용)
export function getCheckins({ storeId, userId, status } = {}) {
  const params = new URLSearchParams()
  if (storeId) params.set("store_id", storeId)
  if (userId) params.set("user_id", userId)
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

// 뱃지 목록 (조건 포함)
export function getBadges() {
  return requestJSON("/badges")
}

// 유저별 뱃지 획득 여부 (실제 승인된 체크인 기준으로 서버가 계산해서 내려줌)
export function getUserBadges(userId) {
  return requestJSON(`/users/${userId}/badges`)
}

// 관리자 — 뱃지 생성 (이모지 또는 이미지 + 조건 여러 개)
export function createBadge({ name, description, emoji, conditions, imageBlob }) {
  const formData = new FormData()
  formData.append("name", name)
  if (description) formData.append("description", description)
  if (emoji) formData.append("emoji", emoji)
  formData.append("conditions", JSON.stringify(conditions))
  if (imageBlob) formData.append("image", imageBlob, "badge.png")
  return requestForm("/admin/badges", formData)
}

// 관리자 — 뱃지 삭제
export async function deleteBadge(badgeId) {
  const res = await fetch(`${API_BASE_URL}/admin/badges/${badgeId}`, { method: "DELETE" })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `요청 실패: ${res.status}`)
  }
  return res.json()
}