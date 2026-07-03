// 위치·거리 관련 유틸. 지도 라이브러리(Leaflet/네이버 등)와 무관하게 재사용됨.

// 두 좌표 사이 거리(km) — Haversine 공식
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371 // 지구 반지름(km)
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 거리 보기 좋게: 1km 미만은 m, 이상은 km
export function formatDistance(km) {
  if (km == null) return ""
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

// 실제 위치를 못 받을 때 쓰는 데모 위치 (성수동)
const DEMO_LOCATION = { lat: 37.5446, lng: 127.0505 }

// 브라우저에서 내 위치 가져오기.
// 실패(권한 거부/미지원)하면 데모 위치로 폴백해서 항상 값을 돌려줌(reject 없음).
export function getMyLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...DEMO_LOCATION, isDemo: true })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, isDemo: false }),
      () => resolve({ ...DEMO_LOCATION, isDemo: true }),
      { timeout: 5000, enableHighAccuracy: true }
    )
  })
}
