import { useEffect, useMemo, useState } from "react"
import { haversineKm, formatDistance } from "../lib/geo"
import { getNearbyPlaces, searchPlace, getStores, getAvailableRewards, getPlaceImages } from "../lib/api"
import { getStampsByStore } from "../lib/stamps"

const CATEGORY_EMOJI = {
  한식: "🍚",
  중식: "🥢",
  일식: "🍣",
  양식: "🍝",
  분식: "🍢",
  치킨: "🍗",
  주점: "🍺",
  카페: "☕",
  디저트: "🍰",
  기타: "🍽️",
}
function emojiFor(category) {
  return CATEGORY_EMOJI[category] || "🍽️"
}

// 카테고리 칩은 이 순서로 고정하되, 지금 주변 결과에 실제로 있는 카테고리만 노출함 (빈 칩 방지)
const CATEGORY_ORDER = ["한식", "중식", "일식", "양식", "분식", "치킨", "주점", "카페", "디저트", "기타"]

// 목록 로딩 중 자리를 잡아주는 스켈레톤 카드 (빈 화면에 텍스트만 뜨는 것보다 덜 휑함)
function SkeletonCard() {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-slate-100 bg-white p-5 lg:p-6">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-slate-100 lg:h-24 lg:w-24" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  )
}

// 홈 — 사장님 등록(인증) 여부와 무관하게 카카오맵 실제 매장을 위치 기반 + 검색으로 보여줌.
// 우리 DB(getStores)에 이미 있는 매장(누군가 방문했거나 사장님이 인증한 매장)은 스탬프·리워드 표시를 덧입힘.
export default function HomeScreen({ onSelectStore, myLocation, locating, onLocate, user }) {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [ourStoresByPlaceId, setOurStoresByPlaceId] = useState({}) // kakao_place_id -> 우리 DB 매장(id/categories/keywords/image_url)
  const [rewardStoreIds, setRewardStoreIds] = useState(new Set()) // 내가 리워드 수령 가능한 매장 id들
  const [stampsByStore, setStampsByStore] = useState({}) // storeId -> 내 스탬프 개수
  const [thumbsByUrl, setThumbsByUrl] = useState({}) // place_url -> 카카오맵에서 긁어온 대표 이미지 (점진적으로 채워짐)

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

  // 목록에 뜬 매장들의 카카오맵 대표 이미지를 배경에서 한 번에 긁어와 채워줌 (카드는 먼저 이모지로 뜨고, 도착하는 대로 사진으로 교체)
  useEffect(() => {
    const urls = places.map((p) => p.place_url).filter((u) => u && !(u in thumbsByUrl))
    if (urls.length === 0) return
    let cancelled = false
    getPlaceImages(urls)
      .then((map) => {
        if (!cancelled) setThumbsByUrl((prev) => ({ ...prev, ...map }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places])

  // 카카오 결과 + 우리 DB 데이터 병합, 거리 계산, 카테고리 필터
  const list = useMemo(() => {
    let merged = places.map((p) => {
      const ours = ourStoresByPlaceId[p.kakao_place_id]
      // 우리 DB에 사장님이 지정한 카테고리가 있으면 그걸 우선, 없으면 카카오에서 뽑은 대분류(p.category)
      const displayCategory = ours?.categories?.length ? ours.categories[0] : p.category
      return {
        ...p,
        id: ours?.id,
        displayCategory,
        keywords: ours?.keywords || [],
        // 우리 DB 이미지 > 카카오맵에서 긁어온 썸네일 순으로 사용
        image_url: ours?.image_url || thumbsByUrl[p.place_url] || undefined,
        distanceKm: myLocation ? haversineKm(myLocation.lat, myLocation.lng, p.lat, p.lng) : null,
      }
    })

    if (cat !== "전체") {
      merged = merged.filter((p) => p.displayCategory === cat)
    }

    return merged.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
  }, [places, ourStoresByPlaceId, thumbsByUrl, cat, myLocation])

  // 세분화한 카테고리 전체를 고정으로 노출 (주변에 없는 카테고리를 눌러도 "결과 없음"으로 안내)
  const catChips = ["전체", ...CATEGORY_ORDER]

  return (
    <div>
      {/* lg 이상(PC/태블릿 가로)에서는 SideNav에 이미 로고가 있어서 중복 표시하지 않음 */}
      <header className="flex items-center gap-2 px-5 pt-6 pb-3 lg:hidden">
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
            <button onClick={() => setQuery("")} className="shrink-0 text-slate-300">
              ✕
            </button>
          )}
          <button
            onClick={onLocate}
            disabled={locating}
            title="내 위치 새로고침"
            className="shrink-0 border-l border-slate-100 pl-2 text-slate-400 disabled:opacity-50"
          >
            {locating ? <span className="inline-block animate-spin">⏳</span> : "📍"}
          </button>
        </div>
      </div>

      {myLocation?.isDemo && (
        <p className="px-5 pt-2 text-xs text-amber-600">
          실제 위치를 못 받아 데모 위치(성수동)로 표시 중이에요.
        </p>
      )}

      <div className="mt-3 flex gap-2 overflow-x-auto px-5 pb-4">
        {catChips.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm ${cat === c ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {c === "전체" ? c : `${emojiFor(c)} ${c}`}
          </button>
        ))}
      </div>

      <div className="px-5">
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="py-10 text-center text-red-400">매장을 불러오지 못했어요: {error}</p>
        )}

        {!loading && !error && list.length === 0 && (
          <p className="py-10 text-center text-slate-400">
            {isSearching
              ? "검색 결과가 없어요 🥲"
              : cat !== "전체"
                ? `주변에 '${cat}' 매장이 없어요 🥲`
                : "주변에 매장이 없어요 🥲"}
          </p>
        )}

        {!loading && !error && isSearching && list.length > 0 && (
          <p className="mb-3 text-xs text-slate-400">검색 결과 {list.length}개</p>
        )}

        {!loading && !error && list.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3">
            {list.map((s) => (
              <button
                key={s.kakao_place_id}
                onClick={() => onSelectStore(s)}
                className="flex w-full items-center gap-5 rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.99] hover:border-amber-200 hover:shadow-md lg:p-6"
              >
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50 text-3xl lg:h-24 lg:w-24">
                  {s.image_url ? (
                    <img
                      key={s.image_url}
                      src={s.image_url}
                      alt={s.name}
                      className="h-full w-full object-cover [animation:thumb-fade-in_0.4s_ease-in]"
                    />
                  ) : (
                    emojiFor(s.displayCategory)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900">{s.name}</h2>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.distanceKm != null && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                        📍 {formatDistance(s.distanceKm)}
                      </span>
                    )}
                    {s.id && rewardStoreIds.has(s.id) && (
                      <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                        🎁 리워드 수령 가능
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {s.displayCategory || "음식점"}
                    {" · 스탬프 "}
                    {(s.id && stampsByStore[s.id]) ?? 0}개
                  </p>
                  {s.keywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
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
        )}
      </div>
    </div>
  )
}
