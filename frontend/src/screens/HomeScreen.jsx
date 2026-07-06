import { useEffect, useMemo, useState } from "react"
import { haversineKm, formatDistance } from "../lib/geo"
import { getStores, getCategoryOptions } from "../lib/api"
import { storeMatchesQuery } from "../lib/fuzzySearch"

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
function emojiFor(categories) {
  const first = categories?.[0]
  return CATEGORY_EMOJI[first] || "🍽️"
}

// 홈 — 지역(시/도·구) 선택 또는 내 위치 기준 + 카테고리 필터
// 지역 목록은 실제 등록된 매장들의 sido/gu 값에서, 카테고리 목록은 백엔드 /categories에서 실시간으로 가져옴
export default function HomeScreen({ onSelectStore, myLocation, locating, onLocate }) {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [categoryOptions, setCategoryOptions] = useState([]) // ["카페", "한식", ...]

  const [sido, setSido] = useState(null)
  const [gu, setGu] = useState(null)
  const [cat, setCat] = useState("전체")
  const [nearby, setNearby] = useState(false) // 내 위치 기준 정렬 모드
  const [query, setQuery] = useState("") // 매장 이름/지역/카테고리/키워드 통합 검색어

  useEffect(() => {
    setLoading(true)
    getStores()
      .then((data) => {
        setStores(data)
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getCategoryOptions()
      .then((opts) => setCategoryOptions(opts.map((o) => o.name)))
      .catch(() => setCategoryOptions([])) // 실패해도 "전체"만으로 화면은 뜨게
  }, [])

  const catChips = ["전체", ...categoryOptions]

  // 실제 데이터에 존재하는 시/도 목록 (있는 지역만 노출됨)
  const sidoList = useMemo(() => {
    const set = new Set(stores.map((s) => s.sido).filter(Boolean))
    return Array.from(set).sort()
  }, [stores])

  const guList = useMemo(() => {
    const set = new Set(stores.filter((s) => s.sido === sido).map((s) => s.gu).filter(Boolean))
    return Array.from(set).sort()
  }, [stores, sido])

  useEffect(() => {
    if (sido || sidoList.length === 0) return
    setSido(sidoList[0])
  }, [sidoList, sido])

  useEffect(() => {
    if (!sido) return
    if (gu && guList.includes(gu)) return
    setGu(guList[0] || null)
  }, [sido, guList, gu])

  const handleSido = (v) => {
    setSido(v)
    setGu(null)
    setNearby(false)
  }
  const handleNearby = async () => {
    const loc = myLocation || (await onLocate())
    if (loc) setNearby(true)
  }

  // 검색어가 있으면 지역/카테고리 필터 대신 전체 매장에서 이름·주소·지역·카테고리·키워드를 통합 검색
  // (이름은 오타/띄어쓰기가 조금 틀려도 비슷하면 걸리도록 fuzzySearch가 처리)
  const isSearching = query.trim().length > 0

  let list = isSearching
    ? stores.filter((s) => storeMatchesQuery(s, query))
    : stores.filter((s) => cat === "전체" || (s.categories || []).includes(cat))

  if (nearby && myLocation) {
    list = list
      .map((s) => ({ ...s, distanceKm: haversineKm(myLocation.lat, myLocation.lng, s.lat, s.lng) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  } else if (!isSearching) {
    list = list.filter((s) => s.sido === sido && s.gu === gu)
  }

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
            placeholder="매장 이름, 지역, 카테고리, 키워드로 검색"
            className="w-full text-sm text-slate-700 outline-none"
          />
          {isSearching && (
            <button onClick={() => setQuery("")} className="text-slate-300">
              ✕
            </button>
          )}
        </div>
      </div>

      {!isSearching && (
      <>
      <div className="flex items-center gap-2 px-5">
        <select
          value={sido || ""}
          onChange={(e) => handleSido(e.target.value)}
          disabled={sidoList.length === 0}
          className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ${nearby ? "text-slate-400" : "text-slate-700"}`}
        >
          {sidoList.length === 0 && <option value="">지역 없음</option>}
          {sidoList.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={gu || ""}
          onChange={(e) => {
            setGu(e.target.value)
            setNearby(false)
          }}
          disabled={guList.length === 0}
          className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ${nearby ? "text-slate-400" : "text-slate-700"}`}
        >
          {guList.length === 0 && <option value="">-</option>}
          {guList.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          onClick={handleNearby}
          disabled={locating}
          className={`ml-auto whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${nearby ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          {locating ? "찾는 중..." : "📍 내 위치"}
        </button>
      </div>

      {nearby && myLocation?.isDemo && (
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
            {c}
          </button>
        ))}
      </div>
      </>
      )}

      <div className="space-y-3 px-5">
        {loading && <p className="py-10 text-center text-slate-400">불러오는 중...</p>}

        {!loading && error && (
          <p className="py-10 text-center text-red-400">매장을 불러오지 못했어요: {error}</p>
        )}

        {!loading && !error && list.length === 0 && (
          <p className="py-10 text-center text-slate-400">
            {isSearching ? "검색 결과가 없어요 🥲" : "이 지역엔 아직 등록된 맛집이 없어요 🥲"}
          </p>
        )}

        {!loading && !error && isSearching && list.length > 0 && (
          <p className="text-xs text-slate-400">검색 결과 {list.length}개</p>
        )}

        {!loading &&
          !error &&
          list.map((s) => (
            <button
              key={s.id}
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
                </div>
                <p className="text-sm text-slate-500">
                  {(s.categories || []).join(", ")} · 방문 {s.myStamps ?? 0}회
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(s.keywords || []).map((k) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      #{k}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-slate-300">›</span>
            </button>
          ))}
      </div>
    </div>
  )
}