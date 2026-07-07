import { useEffect, useState } from "react"
import { getUserBadges, getCheckins, getUserCategoryTiers } from "../lib/api"
import StomachMap from "../components/StomachMap"
import TierBadge from "../components/TierBadge"

// 카테고리별 기본 이모지 (HomeScreen과 동일한 매핑)
const CATEGORY_EMOJI = {
  카페: "☕",
  한식: "🍚",
  중식: "🥢",
  일식: "🍣",
  양식: "🍝",
  분식: "🍢",
  주점: "🍺",
  디저트: "🍰",
}
function emojiFor(category) {
  return CATEGORY_EMOJI[category] || "🍽️"
}

// 마이 — 프로필 + 실제 뱃지 + 실제 방문 기록 (정복 지도)
export default function MyPageScreen({ user, onLogout, onEnterOwnerMode, onOpenStore, onEditProfile, onDeleteAccount }) {
  const [badges, setBadges] = useState(null)
  const [checkins, setCheckins] = useState(null)
  const [categoryTiers, setCategoryTiers] = useState(null)
  const [sortBy, setSortBy] = useState("recent") // recent | frequent

  useEffect(() => {
    getUserBadges(user.id)
      .then(setBadges)
      .catch(() => setBadges([]))
    getCheckins({ userId: user.id, status: "approved" })
      .then(setCheckins)
      .catch(() => setCheckins([]))
    getUserCategoryTiers(user.id)
      .then(setCategoryTiers)
      .catch(() => setCategoryTiers([]))
  }, [user.id])

  // 승인된 체크인을 매장별로 묶어서 방문 횟수·최근 방문일 계산 (더미 데이터 없이 실제 방문만)
  const visitedStores = (() => {
    if (!checkins) return null
    const map = new Map()
    for (const c of checkins) {
      const store = c.stores
      if (!store) continue
      if (!map.has(store.id)) map.set(store.id, { ...store, count: 0, lastVisitedAt: c.created_at })
      const entry = map.get(store.id)
      entry.count += 1
      if (new Date(c.created_at) > new Date(entry.lastVisitedAt)) entry.lastVisitedAt = c.created_at
    }
    const list = Array.from(map.values())
    list.sort((a, b) =>
      sortBy === "recent"
        ? new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt)
        : b.count - a.count
    )
    return list
  })()

  // 총 스탬프 = 체크인 개수가 아니라 각 체크인에 적립된 스탬프 개수의 합 (사장님이 수락할 때 개수를 정할 수 있어서)
  const totalStamps = checkins?.reduce((sum, c) => sum + (c.stamp_count ?? 1), 0) ?? 0

  return (
    <div className="pb-4 lg:mx-auto lg:max-w-3xl">
      <header className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">내 정복 지도 🏆</h1>
      </header>

      <div className="px-5">
        {/* 프로필 */}
        <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-5 text-white">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-500 text-2xl">
            {user.profile_image_url ? (
              <img src={user.profile_image_url} alt={user.nickname} className="h-full w-full object-cover" />
            ) : (
              "😋"
            )}
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold">{user.nickname}</p>
            <p className="text-sm text-slate-300">총 스탬프 {totalStamps}개</p>
          </div>
          {onEditProfile && (
            <button
              onClick={onEditProfile}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
            >
              프로필 수정
            </button>
          )}
        </div>

        {/* 카테고리별 티어 — 매장이 아니라 카테고리 단위 (한식 브론즈, 일식 실버 같은 식). 리그오브레전드 랭크 토큰 참고 */}
        <section className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">카테고리별 티어</h3>
          {categoryTiers === null ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : categoryTiers.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              스탬프를 모으면 카테고리별로 티어가 생겨요!
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {categoryTiers.map((t) => (
                <TierBadge
                  key={t.category}
                  tier={t.tier}
                  emoji={emojiFor(t.category)}
                  label={t.category}
                  totalStamps={t.total_stamps}
                />
              ))}
            </div>
          )}
        </section>

        {/* 내 위장 지도 — 자주 간 매장일수록 크게. 여태 방문한 매장 전체를 위장 실루엣에 채움 */}
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-900">내 위장 지도 🫃</h3>
            <span className="text-xs text-slate-400">자주 간 곳일수록 크게 나와요</span>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            {visitedStores === null ? (
              <p className="py-10 text-center text-sm text-slate-400">불러오는 중...</p>
            ) : (
              <StomachMap stores={visitedStores} onSelectStore={onOpenStore} nickname={user.nickname} />
            )}
          </div>
        </section>

        {/* 뱃지 (관리자 페이지에서 만든 실제 뱃지 + 실제 획득 여부) */}
        <section className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">내 뱃지</h3>
          {badges === null ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : badges.length === 0 ? (
            <p className="text-sm text-slate-400">아직 등록된 뱃지가 없어요</p>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className={`flex flex-col items-center gap-1 rounded-2xl p-3 ${
                    b.earned ? "bg-amber-50" : "bg-slate-50 opacity-40"
                  }`}
                >
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.name} className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <span className="text-3xl">{b.emoji}</span>
                  )}
                  <span className="text-center text-[11px] leading-tight text-slate-600">{b.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 방문한 곳 — 실제로 스탬프를 받은(승인된) 매장만, 정렬 가능 */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">내가 방문한 곳</h3>
            <div className="flex gap-1 rounded-full bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setSortBy("recent")}
                className={`rounded-full px-2.5 py-1 ${
                  sortBy === "recent" ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-400"
                }`}
              >
                최근 방문순
              </button>
              <button
                onClick={() => setSortBy("frequent")}
                className={`rounded-full px-2.5 py-1 ${
                  sortBy === "frequent" ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-400"
                }`}
              >
                많이 방문한 순
              </button>
            </div>
          </div>

          {visitedStores === null ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : visitedStores.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              아직 방문 인증한 곳이 없어요. 지도에서 맛집을 찾아 방문해보세요!
            </p>
          ) : (
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
              {visitedStores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpenStore(s)}
                  className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-left"
                >
                  <span className="text-xl">{emojiFor((s.categories || [])[0])}</span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">
                      최근 방문 {new Date(s.lastVisitedAt).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <span className="text-sm text-slate-400">{s.count}회</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 사장님 모드 — 카카오 로그인 계정이면 누구나 진입 가능. 매장 등록 여부는 OwnerApp에서 판단 */}
        {onEnterOwnerMode && (
          <button
            onClick={onEnterOwnerMode}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 font-semibold text-white"
          >
            🏪 사장님 모드로 전환
          </button>
        )}

        {/* 로그아웃 */}
        <button
          onClick={onLogout}
          className="mt-3 w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-500"
        >
          로그아웃
        </button>

        {/* 회원탈퇴 — 눈에 덜 띄게, 로그아웃과 헷갈리지 않도록 아래에 작은 텍스트로 */}
        {onDeleteAccount && (
          <button
            onClick={onDeleteAccount}
            className="mt-3 w-full text-center text-xs text-slate-400 underline"
          >
            회원탈퇴
          </button>
        )}
      </div>
    </div>
  )
}
