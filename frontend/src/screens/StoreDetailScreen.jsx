// 매장 상세 — 정보 + 내 스탬프 + 방문 랭킹 + 리워드 + 인증 버튼
// 랭킹/리워드는 아직 백엔드에 없어서, 데이터가 있을 때만 섹션을 보여줌 (없으면 숨김, 크래시 방지)

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

export default function StoreDetailScreen({ store, onBack, onCheckin }) {
  if (!store) return null

  const categories = store.categories || []
  const keywords = store.keywords || []
  const topVisitors = store.topVisitors || []
  const rewards = store.rewards || []

  return (
    <div className="pb-4">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">매장 정보</h1>
      </header>

      <div className="px-5">
        <div className="flex items-center justify-center rounded-3xl bg-amber-50 py-10 text-6xl">
          {emojiFor(categories)}
        </div>

        <h2 className="mt-4 text-2xl font-bold text-slate-900">{store.name}</h2>
        <p className="text-slate-500">
          {categories.join(", ")} · {store.address}
        </p>
        {keywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {keywords.map((k) => (
              <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                #{k}
              </span>
            ))}
          </div>
        )}

        {/* 내 스탬프 */}
        <div className="mt-5 rounded-2xl bg-amber-500 p-4 text-white">
          <p className="text-sm opacity-90">내 스탬프</p>
          <p className="text-2xl font-bold">
            {store.myStamps ?? 0}개
            {store.myRank ? ` · 현재 ${store.myRank}위 🏅` : ""}
          </p>
        </div>

        {/* 방문 랭킹 — 데이터 있을 때만 표시 (아직 백엔드에 랭킹 API 없음) */}
        {topVisitors.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 font-semibold text-slate-900">방문 랭킹</h3>
            <div className="space-y-1.5">
              {topVisitors.map((v) => (
                <div key={v.rank} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                  <span className="text-slate-700">
                    <b className="mr-2 text-amber-600">{v.rank}위</b>
                    {v.nickname}
                  </span>
                  <span className="text-sm text-slate-400">{v.count}회</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 사장님 리워드 — 데이터 있을 때만 표시 (아직 백엔드에 리워드 API 없음) */}
        {rewards.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 font-semibold text-slate-900">사장님 리워드 🎁</h3>
            {rewards.map((r, i) => (
              <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="font-medium text-amber-800">{r.title}</p>
                <p className="text-sm text-amber-600">{r.desc}</p>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* 인증 버튼 */}
      <div className="px-5 pt-6">
        <button
          onClick={onCheckin}
          className="w-full rounded-2xl bg-amber-500 py-4 font-semibold text-white active:bg-amber-600"
        >
          📸 방문 인증하기
        </button>
      </div>
    </div>
  )
}