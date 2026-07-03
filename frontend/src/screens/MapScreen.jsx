// ⚠️ 네이버 지도로 교체 시 이 파일만 바꾸면 됨.
//    (내 위치·거리 계산은 lib/geo.js 에 있어 그대로 재사용, App/Home도 안 바뀜)
import { useEffect, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { stores, categories } from "../data/mockData"
import { haversineKm, formatDistance } from "../lib/geo"

// 지도 중심 (성수동 부근)
const center = [37.5454, 127.0525]

// 컨테이너 크기가 확정된 뒤 Leaflet에 "크기 다시 재라"고 알려줌 (회색 여백 방지)
function ResizeFix() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}

// 내 위치가 잡히면 그쪽으로 지도 이동
function RecenterOnUser({ location }) {
  const map = useMap()
  useEffect(() => {
    if (location) map.setView([location.lat, location.lng], 15)
  }, [location, map])
  return null
}

// 매장 핀 — 방문한 곳은 주황, 안 간 곳은 흰색
function makeIcon(store) {
  const visited = store.myStamps > 0
  const bg = visited ? "#f59e0b" : "#ffffff"
  const border = visited ? "3px solid #ffffff" : "2px solid #cbd5e1"
  const opacity = visited ? "1" : "0.9"
  return L.divIcon({
    className: "",
    html: `
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:40px;height:40px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${bg};border:${border};
        box-shadow:0 2px 6px rgba(0,0,0,.3);opacity:${opacity};">
        <span style="transform:rotate(45deg);font-size:20px;">${store.image}</span>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -38],
  })
}

// 내 위치 파란 점
const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 5px rgba(59,130,246,.25)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

export default function MapScreen({ onSelectStore, myLocation, locating, onLocate }) {
  const [cat, setCat] = useState("전체")
  const visibleStores = stores.filter((s) => cat === "전체" || s.category === cat)

  return (
    <div className="relative h-full">
      <MapContainer center={center} zoom={15} scrollWheelZoom={true} className="h-full w-full">
        <ResizeFix />
        <RecenterOnUser location={myLocation} />
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 내 위치 마커 */}
        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={userIcon}>
            <Popup>내 위치{myLocation.isDemo ? " (데모)" : ""}</Popup>
          </Marker>
        )}

        {/* 매장 마커 (선택한 카테고리만) */}
        {visibleStores.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={makeIcon(s)}>
            <Popup>
              <div className="min-w-[160px]">
                <p className="text-base font-semibold text-slate-900">
                  {s.image} {s.name}
                </p>
                <p className="text-sm text-slate-500">
                  {s.category}
                  {s.myStamps > 0 ? ` · 방문 ${s.myStamps}회 ✅` : " · 아직 안 감"}
                </p>
                {myLocation && (
                  <p className="text-sm font-medium text-amber-600">
                    📍 여기서 {formatDistance(haversineKm(myLocation.lat, myLocation.lng, s.lat, s.lng))}
                  </p>
                )}
                <button
                  onClick={() => onSelectStore(s)}
                  className="mt-2 w-full rounded-lg bg-amber-500 py-1.5 text-sm font-medium text-white"
                >
                  매장 페이지 열기
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 상단 카테고리 필터 */}
      <div className="absolute inset-x-0 top-0 z-[1000] flex gap-2 overflow-x-auto bg-gradient-to-b from-white/95 to-transparent px-3 py-3">
        {categories.map((c) => (
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
