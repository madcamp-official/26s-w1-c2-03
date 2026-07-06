import { useEffect, useMemo, useState } from "react"
import { haversineKm, formatDistance } from "../lib/geo"
import { getNearbyPlaces, searchPlace, getStores, getAvailableRewards } from "../lib/api"
import { getStampsByStore } from "../lib/stamps"

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
function emojiFor(categories) {
  const first = categories?.[0]
  return CATEGORY_EMOJI[first] || "🍽️"
}

const CAT_CHIPS = [
  { key: "전체", groupCode: null },
  { key: "음식점", groupCode: "FD6" },
  { key: "카페", groupCode: "CE7" },
]

// 홈 — 사장님 등록(인증) 여부와 무관하게 카카오맵 실제 매장을 위치 기반 + 검색으로 보여줌.
// 우리 DB(getStores)에 이미 있는 매장(누군가 방문했거나 사장님이 인증한 매장)은 스탬프·리워드 표시를 덧입힘.
export default function HomeScreen({ onSelectStore, myLocation, locating, onLocate, user }) {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [ourStoresByPlaceId, setOurStoresByPlaceId] = useState({}) // kakao_place_id -> 우리 DB 매장(id/categories/keywords/image_url)
  const [rewardStoreIds, setRewardStoreIds] = useState(new Set()) // 내가 리워드 수령 가능한 매장 id들
  const [stampsByStore, setStampsByStore] = useState({}) // storeId -> 내 스탬프 개수

  const [cat, setCat] = useState("전체")
  const [query, setQuery] = useState("")
  const isSearching = query.trim().length > 0

  // 처음 열었을 때 위치를 못 받아왔으면 한 번 요청 (거부해도 데모 위치로 폴백되니 항상 결과는 나옴)
  useEffect(() => {
    if (!myLocation) onLocate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!myLocation) return
    setLoading(true)
    getNearbyPlaces({ lat: myLocation.lat, lng: myLocation.lng, radius: 3000 })
      .then((data) => {
        setPlaces(data)
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [myLocation])

  // 검색어를 타이핑하면 잠깐 기다렸다가 카카오 키워드 검색 (위치로 결과를 좁힘)
  useEffect(() => {
    if (!isSearching) return
    const timer = setTimeout(() => {
      setLoading(true)
      searchPlace(query.trim(), myLocation ? { lat: myLocation.lat, lng: myLocation.lng, radius: 5000 } : {})
        .then((data) => {
          setPlaces(data)
          setError(null)
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // 검색어를 지우면 다시 주변 목록으로 복귀
  useEffect(() => {
    if (isSearching || !myLocation) return
    getNearbyPlaces({ lat: myLocation.lat, lng: myLocation.lng, radius: 3000 })
      .then(setPlaces)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching])

  // 우리 DB에 이미 있는 매장(누군가 방문했거나 사장님이 인증한 매장) — 스탬프·카테고리·키워드 덧입히는 용도
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
    getAvailableRewards(user.id)
      .then((rewards) => setRewardStoreIds(new Set(rewards.map((r) => r.store_id))))
      .catch(() => setRewardStoreIds(new Set()))
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    getStampsByStore(user.id)
      .then(setStampsByStore)
      .catch(() => setStampsByStore({}))
  }, [user?.id])

  // 카카오 결과 + 우리 DB 데이터 병합, 거리 계산, 카테고리 필터
  const list = useMemo(() => {
    let merged = places.map((p) => {
      const ours = ourStoresByPlaceId[p.kakao_place_id]
      return {
        ...p,
        id: ours?.id,
        categories: ours?.categories?.length ? ours.categories : undefined,
        keywords: ours?.keywords || [],
        image_url: ours?.image_url || undefined,
        distanceKm: myLocation ? haversineKm(myLocation.lat, myLocation.lng, p.lat, p.lng) : null,
      }
    })

    if (cat !== "전체") {
      const groupCode = CAT_CHIPS.find((c) => c.key === cat)?.groupCode
      merged = merged.filter((p) => p.category_group_code === groupCode)
    }

    return merged.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
  }, [places, ourStoresByPlaceId, cat, myLocation])

  return (
    <div>
      <header className="flex items-center gap-2 px-5 pt-6 pb-3">
        <img src="/app-icon.svg" alt="" className="h-8 w-8" />
        <h1 className="text-2xl font-bold text-slate-900">맛짱</h1>
      </header>

      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
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
      </div>

      <div className="flex items-center gap-2 px-5">
        <button
          onClick={onLocate}
          disabled={locating}
          className="whitespace-nowrap rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600"
        >
          {locating ? "찾는 중..." : "📍 내 위치 새로고침"}
        </button>
      </div>

      {myLocation?.isDemo && (
        <p className="px-5 pt-2 text-xs text-amber-600">
          실제 위치를 못 받아 데모 위치(성수동)로 표시 중이에요.
        </p>
      )}

      <div className="mt-3 flex gap-2 overflow-x-auto px-5 pb-4">
        {CAT_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm ${cat === c.key ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {c.key}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-5">
        {loading && <p className="py-10 text-center text-slate-400">불러오는 중...</p>}

        {!loading && error && (
          <p className="py-10 text-center text-red-400">매장을 불러오지 못했어요: {error}</p>
        )}

        {!loading && !error && list.length === 0 && (
          <p className="py-10 text-center text-slate-400">
            {isSearching ? "검색 결과가 없어요 🥲" : "주변에 매장이 없어요 🥲"}
          </p>
        )}

        {!loading && !error && isSearching && list.length > 0 && (
          <p className="text-xs text-slate-400">검색 결과 {list.length}개</p>
        )}

        {!loading &&
          !error &&
          list.map((s) => (
            <button
              key={s.kakao_place_id}
              onClick={() => onSelectStore(s)}
              className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50 text-2xl">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.name} className="h-full w-full object-cover" />
                ) : (
                  emojiFor(s.categories)
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{s.name}</h2>
                  {s.distanceKm != null && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                      📍 {formatDistance(s.distanceKm)}
                    </span>
                  )}
                  {s.id && rewardStoreIds.has(s.id) && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                      🎁 리워드 수령 가능
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  {(s.categories || [s.category_hint?.split(" > ").pop()].filter(Boolean)).join(", ")}
                  {" · 스탬프 "}
                  {(s.id && stampsByStore[s.id]) ?? 0}개
                </p>
                {s.keywords.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.keywords.map((k) => (
                      <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        #{k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-slate-300">›</span>
            </button>
          ))}
      </div>
    </div>
  )
}
