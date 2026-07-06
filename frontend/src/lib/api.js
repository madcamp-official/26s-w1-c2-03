const API_BASE_URL = '/api';

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

async function requestDelete(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE" })
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

// 구글 로그인 — 카카오와 동일한 방식(인가 코드를 백엔드로 넘겨서 처리)
export function loginWithGoogle({ code, redirectUri }) {
  return requestJSON("/auth/google", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
}

export function createCheckin({ userId, storeId, purpose, photoFile, photoConsent }) {
  const formData = new FormData()
  formData.append("user_id", userId)
  formData.append("store_id", storeId)
  if (purpose) formData.append("purpose", purpose)
  formData.append("photo_consent", photoConsent ? "true" : "false")
  formData.append("file", photoFile)
  return requestForm("/checkins", formData)
}

// 매장 등록 (사장님 대시보드용) — 주소는 백엔드에서 카카오 API로 좌표/시도/구군 자동 변환됨
export function createStore({ ownerId, name, address, categories, keywords, imageUrl }) {
  return requestJSON("/stores", {
    method: "POST",
    body: JSON.stringify({
      owner_id: ownerId,
      name,
      address,
      categories,
      keywords,
      image_url: imageUrl,
    }),
  })
}

// 매장 썸네일 직접 업로드 (등록 직후 호출 — 장소검색으로 자동 채운 이미지가 있어도 이걸로 덮어씀)
export function uploadStoreThumbnail(storeId, imageBlob) {
  const formData = new FormData()
  formData.append("image", imageBlob, "store.png")
  return requestForm(`/stores/${storeId}/thumbnail`, formData)
}

// 상호명으로 카카오 장소 검색 (사장님이 직접 주소 안 치고 검색해서 고르는 방식)
export function searchPlace(query) {
  return requestJSON(`/kakao/search-place?query=${encodeURIComponent(query)}`)
}

// 검색 결과로 고른 장소의 카카오맵 대표 이미지 (place_url 필요)
export function getPlaceImage(placeUrl) {
  return requestJSON(`/kakao/place-image?place_url=${encodeURIComponent(placeUrl)}`)
}

// 매장 상세 화면의 "손님이 보낸 사진" 갤러리 (승인 + 공개 동의된 것만)
export function getStorePhotos(storeId) {
  return requestJSON(`/stores/${storeId}/photos`)
}

// 카테고리 선택지 (매장 등록 폼 / 뱃지 조건 폼에서 공용으로 사용)
export function getCategoryOptions() {
  return requestJSON("/categories")
}

export function createCategoryOption(name) {
  return requestJSON("/admin/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function deleteCategoryOption(id) {
  return requestDelete(`/admin/categories/${id}`)
}

// 키워드 선택지 (매장 등록 폼 / 뱃지 조건 폼에서 공용으로 사용)
export function getKeywordOptions() {
  return requestJSON("/keywords")
}

export function createKeywordOption(name) {
  return requestJSON("/admin/keywords", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function deleteKeywordOption(id) {
  return requestDelete(`/admin/keywords/${id}`)
}

// 매장 상세 화면의 방문 랭킹 (해당 매장에서 승인된 체크인 기준, 유저별 방문 횟수 내림차순)
export function getStoreRanking(storeId) {
  return requestJSON(`/stores/${storeId}/ranking`)
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
export function deleteBadge(badgeId) {
  return requestDelete(`/admin/badges/${badgeId}`)
}