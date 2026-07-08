// 카카오맵 버전 MapScreen — 사장님 등록(인증) 여부와 무관하게 카카오맵 실제 매장을 위치 기반 + 검색으로 보여줌.
// 우리 DB(getStores)에 이미 있는 매장은 스탬프·카테고리 표시를 덧입힘.
import { useEffect, useRef, useState } from "react"
import { haversineKm, formatDistance } from "../lib/geo"
import { getNearbyPlaces, searchPlace, getStores, getPlaceImage } from "../lib/api"
import { getStampsByStore } from "../lib/stamps"
import { CATEGORY_ORDER, emojiFor } from "../lib/categoryMeta"

const FALLBACK_CENTER = { lat: 37.5454, lng: 127.0525 }

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

function makePinHtml(store) {
  const visited = (store.myStampCount ?? 0) > 0
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
      <span style="transform:rotate(45deg);font-size:20px;">${emojiFor(store.displayCategory)}</span>
    </div>`
}

function makeUserHtml() {
  return `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 5px rgba(59,130,246,.25)"></div>`
}

export default function MapScreen({ onSelectStore, myLocation, locating, onLocate, user }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const storeOverlaysRef = useRef([])
  const userOverlayRef = useRef(null)
  const popupOverlayRef = useRef(null)
  const didFitBoundsRef = useRef(false)

  const [cat, setCat] = useState("전체")
  const [query, setQuery] = useState("")
  const [mapReady, setMapReady] = useState(false)
  const [sdkError, setSdkError] = useState(null)

  const [places, setPlaces] = useState([])
  const [placesLoading, setPlacesLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [ourStoresByPlaceId, setOurStoresByPlaceId] = useState({})
  const [stampsByStore, setStampsByStore] = useState({}) // storeId -> 내 스탬프 개수

  const center = myLocation || FALLBACK_CENTER
  const isSearching = query.trim().length > 0

  useEffect(() => {
    if (!myLocation) onLocate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 주변 매장 (검색 중이 아닐 때). 카테고리를 고르면 그 업종만 서버에서 직접 조회(HomeScreen과 동일)
  useEffect(() => {
    if (isSearching) return
    setPlacesLoading(true)
    getNearbyPlaces({
      lat: center.lat,
      lng: center.lng,
      radius: cat === "전체" ? 3000 : 5000,
      category: cat === "전체" ? undefined : cat,
    })
      .then((data) => {
        setPlaces(data)
        setLoadError(null)
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setPlacesLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, cat, isSearching])

  // 검색어로 카카오 키워드 검색 (위치로 결과를 좁힘)
  useEffect(() => {
    if (!isSearching) return
    setPlacesLoading(true)
    const timer = setTimeout(() => {
      searchPlace(query.trim(), { lat: center.lat, lng: center.lng, radius: 10000 })
        .then((data) => {
          setPlaces(data)
          setLoadError(null)
          didFitBoundsRef.current = false // 검색 결과 범위로 다시 맞추기
        })
        .catch((err) => setLoadError(err.message))
        .finally(() => setPlacesLoading(false))
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    getStores()
      .then((stores) => {
        const map = {}
        for (const s of stores) map[s.kakao_place_id] = s
        setOurStoresByPlaceId(map)
      })
      .catch(() => setOurStoresByPlaceId({}))
  }, [])

  useEffect(() => {
    if (!user) return
    getStampsByStore(user.id)
      .then(setStampsByStore)
      .catch(() => setStampsByStore({}))
  }, [user?.id])

  const visibleStores = places
    .map((p) => {
      const ours = ourStoresByPlaceId[p.kakao_place_id]
      const displayCategory = ours?.categories?.length ? ours.categories[0] : p.category
      // 필터 매칭용: 사장님 지정 카테고리 + 카카오 파생 카테고리를 모두 후보로 (HomeScreen과 동일)
      const matchCategories = new Set([...(ours?.categories || []), p.category].filter(Boolean))
      return {
        ...p,
        id: ours?.id,
        displayCategory,
        matchCategories,
        image_url: ours?.image_url || undefined,
        myStampCount: (ours?.id && stampsByStore[ours.id]) ?? 0,
      }
    })
    .filter((p) => cat === "전체" || p.matchCategories.has(cat))

  // 세분화한 카테고리 전체를 고정으로 노출 (HomeScreen과 동일)
  const catChips = ["전체", ...CATEGORY_ORDER]

  useEffect(() => {
    let cancelled = false
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng),
          level: 6,
        })
        mapRef.current = map
        setMapReady(true)
      })
      .catch((err) => setSdkError(err.message))

    return () => {
      cancelled = true
    }
  }, [])

  function showPopup(kakao, map, store, position) {
    if (popupOverlayRef.current) popupOverlayRef.current.setMap(null)

    const el = document.createElement("div")
    el.innerHTML = `
      <div style="min-width:200px;background:white;border-radius:10px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,.2);">
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <div id="popup-thumb" style="width:44px;height:44px;flex-shrink:0;border-radius:8px;overflow:hidden;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:22px;">
            ${
              store.image_url
                ? `<img src="${store.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
                : emojiFor(store.displayCategory)
            }
          </div>
          <div style="min-width:0;flex:1;">
            <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${store.name}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#64748b;">
              ${store.displayCategory || "음식점"}${(store.myStampCount ?? 0) > 0 ? ` · 스탬프 ${store.myStampCount}개 ✅` : " · 아직 안 감"}
            </p>
            ${
              myLocation
                ? `<p style="margin:2px 0 0;font-size:13px;font-weight:500;color:#d97706;">📍 여기서 ${formatDistance(
                    haversineKm(myLocation.lat, myLocation.lng, store.lat, store.lng)
                  )}</p>`
                : ""
            }
          </div>
        </div>
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

    // 클릭한 매장 사진 1장만 그때 가져옴(지도 핀 전체를 미리 긁어오지 않음) — 도착하면 이모지 자리에 페이드인으로 교체
    if (!store.image_url && store.place_url) {
      getPlaceImage(store.place_url)
        .then(({ image_url }) => {
          if (!image_url || popupOverlayRef.current !== overlay) return
          const thumb = el.querySelector("#popup-thumb")
          if (thumb) {
            thumb.innerHTML = `<img src="${image_url}" alt="" style="width:100%;height:100%;object-fit:cover;animation:thumb-fade-in 0.4s ease-in;" />`
          }
        })
        .catch(() => {})
    }
  }

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

    if (!didFitBoundsRef.current && withCoords.length > 0) {
      const bounds = new kakao.maps.LatLngBounds()
      withCoords.forEach((s) => bounds.extend(new kakao.maps.LatLng(s.lat, s.lng)))
      map.setBounds(bounds)
      didFitBoundsRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, cat, places, ourStoresByPlaceId, stampsByStore])

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

    if (!didFitBoundsRef.current) {
      map.setCenter(position)
      map.setLevel(4)
    }
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

      <div className="absolute inset-x-0 top-0 z-[1000] bg-gradient-to-b from-white/95 to-transparent px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
          <span className="text-slate-400">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="매장 이름으로 검색"
            className="w-full text-sm text-slate-700 outline-none"
          />
          {isSearching && (
            <button onClick={() => setQuery("")} className="text-slate-300">
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {catChips.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm shadow-sm ${cat === c ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}
            >
              {c === "전체" ? c : `${emojiFor(c)} ${c}`}
            </button>
          ))}
        </div>

        {placesLoading && (
          <div className="mt-2 flex justify-center">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs text-slate-500 shadow-sm">
              매장 불러오는 중...
            </span>
          </div>
        )}
      </div>

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

      <button
        onClick={() => {
          didFitBoundsRef.current = false
          onLocate()
        }}
        disabled={locating}
        className="absolute bottom-8 right-3 z-[1000] rounded-full bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg"
      >
        {locating ? "찾는 중..." : "📍 내 위치"}
      </button>
    </div>
  )
}
