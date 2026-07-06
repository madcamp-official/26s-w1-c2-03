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

const GOOD_ENOUGH_ACCURACY_M = 30 // 오차반경이 이 정도면 더 기다리지 않고 바로 씀
const MAX_WATCH_MS = 6000 // 이 시간 넘게 걸리면 그때까지 받은 것 중 가장 정확한 값으로 마무리

// 브라우저에서 내 위치 가져오기.
// GPS는 첫 신호일수록 오차가 크고 몇 초에 걸쳐 정밀해지는 경우가 많아서,
// getCurrentPosition으로 한 번만 받지 않고 watchPosition으로 짧게 여러 번 받아
// 그중 오차반경(accuracy)이 가장 작은 값을 채택함.
// 실패(권한 거부/미지원)하면 데모 위치로 폴백해서 항상 값을 돌려줌(reject 없음).
export function getMyLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...DEMO_LOCATION, isDemo: true })
      return
    }

    let best = null
    let watchId = null
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      resolve(
        best
          ? { lat: best.coords.latitude, lng: best.coords.longitude, accuracy: best.coords.accuracy, isDemo: false }
          : { ...DEMO_LOCATION, isDemo: true }
      )
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
        if (pos.coords.accuracy <= GOOD_ENOUGH_ACCURACY_M) finish()
      },
      () => finish(),
      { enableHighAccuracy: true, timeout: MAX_WATCH_MS, maximumAge: 0 }
    )

    setTimeout(finish, MAX_WATCH_MS)
  })
}
