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

// status 없이 호출하면(손님 화면) 서버가 승인된 매장만 내려줌. ownerId 넘기면(사장님 대시보드) 심사 상태 무관하게 전부.
// status만 넘기면(관리자 승인 대기 목록) 그 상태의 매장만 전체 사장님 대상으로 조회.
export function getStores({ ownerId, status } = {}) {
  const params = new URLSearchParams()
  if (ownerId) params.set("owner_id", ownerId)
  if (status) params.set("status", status)
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

// 네이버 로그인 — 카카오/구글과 동일한 방식. 네이버는 CSRF 방지용 state를 발급 시 값 그대로 넘겨줘야 함
export function loginWithNaver({ code, redirectUri, state }) {
  return requestJSON("/auth/naver", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri, state }),
  })
}

// 닉네임 중복확인 (excludeUserId를 넘기면 본인 닉네임은 중복으로 안 침)
export function checkNickname(nickname, excludeUserId) {
  const params = new URLSearchParams({ nickname })
  if (excludeUserId) params.set("exclude_user_id", excludeUserId)
  return requestJSON(`/users/check-nickname?${params.toString()}`)
}

// 프로필 수정 (닉네임 필수, 사진은 선택 — 온보딩/마이페이지 설정 공용)
export async function updateProfile({ userId, nickname, imageFile }) {
  const formData = new FormData()
  formData.append("nickname", nickname)
  if (imageFile) formData.append("image", imageFile)

  const res = await fetch(`${API_BASE_URL}/users/${userId}/profile`, {
    method: "PATCH",
    body: formData,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `요청 실패: ${res.status}`)
  }
  return res.json()
}

// 회원탈퇴 — 방문 기록도 서버에서 함께 삭제됨, 되돌릴 수 없음
export function deleteUser(userId) {
  return requestDelete(`/users/${userId}`)
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

// 매장 등록 신청 (사장님 대시보드용) — 카카오 장소검색으로 고른 실제 매장 + 사업자등록정보로 신청.
// 서버가 국세청 진위확인을 통과시키면 status='pending'으로 저장되고, 관리자 승인 후 손님 화면에 노출됨.
export function createStore({
  ownerId,
  name,
  address,
  categories,
  keywords,
  imageUrl,
  kakaoPlaceId,
  businessRegistrationNumber,
  businessOwnerName,
  businessStartDate,
}) {
  return requestJSON("/stores", {
    method: "POST",
    body: JSON.stringify({
      owner_id: ownerId,
      name,
      address,
      categories,
      keywords,
      image_url: imageUrl,
      kakao_place_id: kakaoPlaceId,
      business_registration_number: businessRegistrationNumber,
      business_owner_name: businessOwnerName,
      business_start_date: businessStartDate,
    }),
  })
}

// 관리자 — 매장 등록 신청 승인/반려
export function reviewStore({ storeId, status }) {
  return requestJSON(`/stores/${storeId}/review`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}

// 모든 매장의 누적 방문자 수 { storeId: visitorCount } — 홈 화면 '방문자순' 정렬에 사용
export function getStoreVisitCounts() {
  return requestJSON("/stores/visit-counts")
}

// 매장 썸네일 직접 업로드 (등록 직후 호출 — 장소검색으로 자동 채운 이미지가 있어도 이걸로 덮어씀)
export function uploadStoreThumbnail(storeId, imageBlob) {
  const formData = new FormData()
  formData.append("image", imageBlob, "store.png")
  return requestForm(`/stores/${storeId}/thumbnail`, formData)
}

// 상호명으로 카카오 장소 검색. lat/lng(+radius, m)를 같이 넘기면 그 주변으로 결과가 좁혀짐
// (사장님 대시보드의 지역별 검색, 손님 화면의 위치 기반 검색 양쪽에서 재사용)
export function searchPlace(query, { lat, lng, radius } = {}) {
  const params = new URLSearchParams({ query })
  if (lat != null && lng != null) {
    params.set("lat", lat)
    params.set("lng", lng)
    if (radius) params.set("radius", radius)
  }
  return requestJSON(`/kakao/search-place?${params.toString()}`)
}

// 현재 위치 반경 내 실제 매장을 카카오맵에서 바로 가져옴 (사장님 등록 여부와 무관하게 노출).
// category를 주면(한식/일식 등) 그 업종만 서버에서 직접 검색해 넉넉히(최대 45개) 돌려줌 — 안 주면 전체(음식점+카페).
export function getNearbyPlaces({ lat, lng, radius, category } = {}) {
  const params = new URLSearchParams({ lat, lng })
  if (radius) params.set("radius", radius)
  if (category) params.set("category", category)
  return requestJSON(`/kakao/nearby-places?${params.toString()}`)
}

// 손님이 카카오 검색/주변 결과에서 매장을 열람할 때 호출 — 우리 DB에 없으면 미인증 상태로 새로 만들고,
// 있으면 그대로 반환. 이후 체크인/랭킹/뱃지는 여기서 받은 store.id로 동작함.
export function resolveStore({ kakaoPlaceId, name, address, lat, lng, imageUrl }) {
  return requestJSON("/stores/resolve", {
    method: "POST",
    body: JSON.stringify({
      kakao_place_id: kakaoPlaceId,
      name,
      address,
      lat,
      lng,
      image_url: imageUrl,
    }),
  })
}

// 검색 결과로 고른 장소의 카카오맵 대표 이미지 (place_url 필요)
export function getPlaceImage(placeUrl) {
  return requestJSON(`/kakao/place-image?place_url=${encodeURIComponent(placeUrl)}`)
}

// 손님 화면 목록의 여러 매장 썸네일을 한 번에 가져옴 — { place_url: image_url } 맵을 돌려줌
// (못 찾은 매장은 응답에 안 들어오고, 프론트에서 이모지로 대체됨)
export function getPlaceImages(placeUrls) {
  return requestJSON("/kakao/place-images", {
    method: "POST",
    body: JSON.stringify({ place_urls: placeUrls }),
  })
}

// 외부 이미지(카카오 썸네일)를 base64 data URL로 받아옴 — 위장 지도 캡처 시 CORS 오염 없이 canvas에 그리기 위함
export function getImageData(url) {
  return requestJSON(`/kakao/image-data?url=${encodeURIComponent(url)}`)
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

// 매장별 리워드 기준 목록 (매장 상세 화면 표시 + 사장님 설정 화면 공용)
export function getStoreRewards(storeId) {
  return requestJSON(`/stores/${storeId}/rewards`)
}

// 리워드 등록 (사장님 매장 설정 화면)
export function createReward({ storeId, stampThreshold, targetType, targetName, rewardKind, discountPercent }) {
  return requestJSON(`/stores/${storeId}/rewards`, {
    method: "POST",
    body: JSON.stringify({
      stamp_threshold: stampThreshold,
      target_type: targetType,
      target_name: targetName,
      reward_kind: rewardKind,
      discount_percent: discountPercent,
    }),
  })
}

export function deleteReward(rewardId) {
  return requestDelete(`/rewards/${rewardId}`)
}

// 유저가 스탬프 기준을 달성했지만 아직 못 받은 리워드 (홈 화면 "리워드 수령 가능" 표시용)
export function getAvailableRewards(userId) {
  return requestJSON(`/users/${userId}/available-rewards`)
}

// 유저가 요청했거나 받은 리워드 목록 [{reward_id, status}] — 매장 상세에서 버튼 상태(수령하기/요청됨/받음) 표시용
export function getUserRewardClaims(userId) {
  return requestJSON(`/users/${userId}/reward-claims`)
}

// 리워드 수령 요청 (매장 상세의 "수령하기" 버튼) — 사장님 승인 전까지 pending 상태로 대기
export function claimReward({ rewardId, userId }) {
  return requestJSON(`/rewards/${rewardId}/claim`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  })
}

// 매장에 걸린 리워드 수령 요청 목록 (사장님 화면) — status 안 넘기면 전체, "pending" 넘기면 대기 중인 것만
export function getStoreRewardRequests(storeId, status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ""
  return requestJSON(`/stores/${storeId}/reward-requests${query}`)
}

// 리워드 수령 요청 승인/거절 (사장님 화면) — action: 'approve' | 'reject'
export function reviewRewardRequest({ userRewardId, action }) {
  return requestJSON(`/user-rewards/${userRewardId}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
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

// 체크인 승인/거절 (승인 시 stampCount로 스탬프 개수 지정, 기본 1)
export function reviewCheckin({ checkinId, status, stampCount }) {
  return requestJSON(`/checkins/${checkinId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, stamp_count: stampCount ?? 1 }),
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

// 카테고리별 누적 스탬프 순위표 — 챌린저 티어(카테고리 내 상위 N명) 판정에 사용
export function getStampLeaderboard(category, limit = 10) {
  return requestJSON(`/leaderboard/stamps?category=${encodeURIComponent(category)}&limit=${limit}`)
}

// 내 카테고리별 티어 (매장이 아니라 카테고리 단위 — 한식 브론즈, 일식 실버 같은 식)
export function getUserCategoryTiers(userId) {
  return requestJSON(`/users/${userId}/category-tiers`)
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