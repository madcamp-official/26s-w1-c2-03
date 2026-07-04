// 카카오맵 버전 MapScreen — 실제 백엔드 API에서 매장 데이터를 가져오고,
// 지도 중심/줌은 등록된 매장들 범위에 맞춰 자동으로 조정됨 (전국 대응)
import { useEffect, useRef, useState } from "react"
import { haversineKm, formatDistance } from "../lib/geo"
import { getStores, getCategoryOptions } from "../lib/api"

// 매장 데이터가 아직 없을 때만 쓰는 기본 중심 (성수동)
const FALLBACK_CENTER = { lat: 37.5454, lng: 127.0525 }

// 카테고리별 기본 이모지 (DB에 이미지 필드가 생기기 전까지 임시로 사용)
const CATEGORY_EMOJI = {
  카페: "☕",
  한식: "🍚",
  중식: "🥢",
  일식: "🍣",
  양식: "🍝",
  분식: "🍢",
  술집: "🍺",
  디저트: "🍰",
}
function emojiFor(category) {
  return CATEGORY_EMOJI[category] || "🍽️"
}

// index.html 의 sdk.js 스크립트가 로드될 때까지 기다렸다가 kakao.maps.load 콜백을 프로미스로 감싸줌
function loadKakaoMaps() {
  return new Promise((resolve, reject) => {
    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => resolve(window.kakao))
      return
    }
    const script = document.querySelector('script[src*="dapi.kakao.com"]')
    if (!script) {
      reject(new Error("Kakao Maps SDK script를 index.html에서 찾을 수 없습니다."))
      return
    }
    script.addEventListener("load", () => {
      window.kakao.maps.load(() => resolve(window.kakao))
    })
    script.addEventListener("error", () => reject(new Error("Kakao Maps SDK 로드에 실패했습니다.")))
  })
}

// 매장 핀 HTML — 방문한 곳은 주황, 안 간 곳은 흰색
function makePinHtml(store) {
  const visited = (store.myStamps ?? 0) > 0
  const bg = visited ? "#f59e0b" : "#ffffff"
  const border = visited ? "3px solid #ffffff" : "2px solid #cbd5e1"
  const opacity = visited ? "1" : "0.9"
  return `
    <div style="
      display:flex;align-items:center;justify-content:center;
      width:40px;height:40px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:${bg};border:${border};
      box-shadow:0 2px 6px rgba(0,0,0,.3);opacity:${opacity};
      cursor:pointer;">
      <span style="transform:rotate(45deg);font-size:20px;">${emojiFor((store.categories || [])[0])}</span>
    </div>`
}

// 내 위치 파란 점 HTML
function makeUserHtml() {
  return `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 5px rgba(59,130,246,.25)"></div>`
}

export default function MapScreen({ onSelectStore, myLocation, locating, onLocate }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const storeOverlaysRef = useRef([])
  const userOverlayRef = useRef(null)
  const popupOverlayRef = useRef(null)
  const didFitBoundsRef = useRef(false) // 최초 1회만 자동으로 화면을 맞추기 위한 플래그

  const [cat, setCat] = useState("전체")
  const [mapReady, setMapReady] = useState(false)
  const [sdkError, setSdkError] = useState(null)

  const [stores, setStores] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [categoryOptions, setCategoryOptions] = useState([])

  // 매장 목록은 화면 진입 시 한 번 백엔드에서 가져옴
  useEffect(() => {
    getStores()
      .then(setStores)
      .catch((err) => setLoadError(err.message))
  }, [])

  useEffect(() => {
    getCategoryOptions()
      .then((options) => setCategoryOptions(options.map((o) => o.name)))
      .catch(() => setCategoryOptions([]))
  }, [])

  const visibleStores = stores.filter((s) => cat === "전체" || (s.categories || []).includes(cat))

  // 지도 최초 1회 생성 (일단 기본 위치로 띄우고, 매장 데이터 도착하면 자동으로 범위 맞춤)
  useEffect(() => {
    let cancelled = false
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng),
          level: 7,
        })
        mapRef.current = map
        setMapReady(true)
      })
      .catch((err) => setSdkError(err.message))

    return () => {
      cancelled = true
    }
  }, [])

  // 매장 클릭 시 팝업(CustomOverlay) 표시
  function showPopup(kakao, map, store, position) {
    if (popupOverlayRef.current) popupOverlayRef.current.setMap(null)

    const el = document.createElement("div")
    el.innerHTML = `
      <div style="min-width:170px;background:white;border-radius:10px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,.2);">
        <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${emojiFor((store.categories || [])[0])} ${store.name}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#64748b;">
          ${(store.categories || []).join(", ")}${(store.myStamps ?? 0) > 0 ? ` · 방문 ${store.myStamps}회 ✅` : " · 아직 안 감"}
        </p>
        ${
          myLocation
            ? `<p style="margin:2px 0 0;font-size:13px;font-weight:500;color:#d97706;">📍 여기서 ${formatDistance(
                haversineKm(myLocation.lat, myLocation.lng, store.lat, store.lng)
              )}</p>`
            : ""
        }
        <button id="open-store-btn" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#f59e0b;padding:6px 0;font-size:13px;font-weight:500;color:white;cursor:pointer;">
          매장 페이지 열기
        </button>
      </div>`

    el.querySelector("#open-store-btn").addEventListener("click", () => onSelectStore(store))

    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: el,
      yAnchor: 1.35,
      zIndex: 10,
    })
    overlay.setMap(map)
    popupOverlayRef.current = overlay
  }

  // 매장 마커 렌더링 (매장 데이터/카테고리 필터 바뀔 때마다 다시 그림)
  useEffect(() => {
    if (!mapReady || !window.kakao) return
    const kakao = window.kakao
    const map = mapRef.current

    storeOverlaysRef.current.forEach((o) => o.setMap(null))
    storeOverlaysRef.current = []
    if (popupOverlayRef.current) {
      popupOverlayRef.current.setMap(null)
      popupOverlayRef.current = null
    }

    const withCoords = visibleStores.filter((s) => s.lat != null && s.lng != null)

    withCoords.forEach((s) => {
      const position = new kakao.maps.LatLng(s.lat, s.lng)
      const el = document.createElement("div")
      el.innerHTML = makePinHtml(s)
      el.addEventListener("click", () => showPopup(kakao, map, s, position))

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 1,
      })
      overlay.setMap(map)
      storeOverlaysRef.current.push(overlay)
    })

    // 매장 데이터가 처음 도착했을 때 딱 한 번, 모든 매장이 화면 안에 들어오도록 범위 자동 조정
    // (그 이후엔 사용자가 지도를 움직여도 다시 강제로 안 옮김)
    if (!didFitBoundsRef.current && withCoords.length > 0) {
      const bounds = new kakao.maps.LatLngBounds()
      withCoords.forEach((s) => bounds.extend(new kakao.maps.LatLng(s.lat, s.lng)))
      map.setBounds(bounds)
      didFitBoundsRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, cat, myLocation, stores])

  // 내 위치 마커 표시 + 지도 이동 (사용자가 직접 "내 위치" 버튼을 눌렀을 때만)
  useEffect(() => {
    if (!mapReady || !window.kakao || !myLocation) return
    const kakao = window.kakao
    const map = mapRef.current
    const position = new kakao.maps.LatLng(myLocation.lat, myLocation.lng)

    if (userOverlayRef.current) userOverlayRef.current.setMap(null)
    const el = document.createElement("div")
    el.innerHTML = makeUserHtml()
    const overlay = new kakao.maps.CustomOverlay({ position, content: el, yAnchor: 0.5 })
    overlay.setMap(map)
    userOverlayRef.current = overlay

    map.setCenter(position)
    map.setLevel(4)
  }, [mapReady, myLocation])

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full w-full" />

      {sdkError && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/90 px-6 text-center text-sm text-slate-500">
          지도를 불러오지 못했습니다: {sdkError}
        </div>
      )}

      {loadError && (
        <div className="absolute inset-x-3 top-16 z-[1000] rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-500">
          매장을 불러오지 못했어요: {loadError}
        </div>
      )}

      {/* 상단 카테고리 필터 */}
      <div className="absolute inset-x-0 top-0 z-[1000] flex gap-2 overflow-x-auto bg-gradient-to-b from-white/95 to-transparent px-3 py-3">
        {["전체", ...categoryOptions].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm shadow-sm ${cat === c ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 범례 (좌하단) */}
      <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] rounded-xl bg-white/95 px-3 py-2 shadow-md">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-500"></span>방문함
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border border-slate-300 bg-white"></span>미방문
          </span>
        </div>
      </div>

      {/* 내 위치 버튼 */}
      <button
        onClick={onLocate}
        disabled={locating}
        className="absolute bottom-8 right-3 z-[1000] rounded-full bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg"
      >
        {locating ? "찾는 중..." : "📍 내 위치"}
      </button>
    </div>
  )
}
