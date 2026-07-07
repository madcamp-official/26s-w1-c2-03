// 매장 상세 — 정보 + 내 스탬프 + 인증 버튼 + 방문 랭킹 + 리워드
import { useEffect, useState } from "react"
import { getStoreRanking, getStorePhotos, getStoreRewards, getCheckins, getUserRewardClaims, claimReward } from "../lib/api"

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

// 리워드 하나를 사람이 읽을 문구로 (StoreRewardsScreen과 동일한 규칙)
function rewardLabel(r) {
  if (r.reward_kind === "discount") return `${r.target_name} ${r.discount_percent}% 할인`
  return r.target_type === "menu" ? `${r.target_name} 무료` : `${r.target_name} 증정`
}

export default function StoreDetailScreen({ store, user, onBack, onCheckin, onSelectProfile }) {
  const [ranking, setRanking] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null) // 크게 보기용으로 고른 사진
  const [myStamps, setMyStamps] = useState(0)
  const [rewards, setRewards] = useState(null)
  const [claimsByReward, setClaimsByReward] = useState({}) // reward_id -> 'pending' | 'approved'
  const [claimingId, setClaimingId] = useState(null) // 수령하기 요청 보내는 중인 reward_id

  useEffect(() => {
    if (!store) return
    setRanking(null)
    getStoreRanking(store.id)
      .then(setRanking)
      .catch(() => setRanking([]))
    setPhotos(null)
    getStorePhotos(store.id)
      .then(setPhotos)
      .catch(() => setPhotos([]))
    setRewards(null)
    getStoreRewards(store.id)
      .then(setRewards)
      .catch(() => setRewards([]))
  }, [store?.id])

  // 이 매장에서 내가 승인받은 체크인들의 스탬프 개수 합 (매장 목록 API엔 안 들어있어서 따로 조회)
  useEffect(() => {
    if (!store || !user) return
    setMyStamps(0)
    getCheckins({ storeId: store.id, userId: user.id, status: "approved" })
      .then((checkins) => setMyStamps(checkins.reduce((sum, c) => sum + (c.stamp_count ?? 1), 0)))
      .catch(() => setMyStamps(0))
  }, [store?.id, user?.id])

  // 내가 요청했거나 이미 받은 리워드 상태 — "수령하기" 버튼을 뭘로 보여줄지 결정
  useEffect(() => {
    if (!user) return
    getUserRewardClaims(user.id)
      .then((claims) => setClaimsByReward(Object.fromEntries(claims.map((c) => [c.reward_id, c.status]))))
      .catch(() => setClaimsByReward({}))
  }, [user?.id])

  const handleClaim = async (rewardId) => {
    setClaimingId(rewardId)
    try {
      await claimReward(rewardId)
      setClaimsByReward((prev) => ({ ...prev, [rewardId]: "pending" }))
    } catch (err) {
      alert(err.message)
    } finally {
      setClaimingId(null)
    }
  }

  if (!store) return null

  const keywords = store.keywords || []
  // 사장님이 지정한 카테고리 > 카카오에서 뽑은 대분류(홈/지도에서 넘어옴) 순
  const category = store.categories?.length ? store.categories.join(", ") : store.category || ""

  return (
    <div className="pb-4">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">매장 정보</h1>
      </header>

      {/* lg 이상(PC/태블릿 가로)에서는 기본정보/리워드/인증버튼(왼쪽)과 랭킹/사진(오른쪽) 2열로 배치 */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:px-8">
        <div>
          <div className="px-5 lg:px-0">
            {store.image_url ? (
              <img
                key={store.image_url}
                src={store.image_url}
                alt={store.name}
                className="h-48 w-full rounded-3xl object-cover [animation:thumb-fade-in_0.4s_ease-in] lg:h-64"
              />
            ) : (
              <div className="flex items-center justify-center rounded-3xl bg-amber-50 py-10 text-6xl lg:h-64">
                {emojiFor(store.categories?.[0] || store.category)}
              </div>
            )}

            <h2 className="mt-4 text-2xl font-bold text-slate-900">{store.name}</h2>
            <p className="text-slate-500">
              {category && <span className="font-medium text-amber-600">{category}</span>}
              {category && store.address ? " · " : ""}
              {store.address}
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
                {myStamps}개
                {store.myRank ? ` · 현재 ${store.myRank}위 🏅` : ""}
              </p>
            </div>

            {/* 사장님 리워드 — 스탬프 개수 달성형 (이미 달성한 건 "달성!" 표시) */}
            <section className="mt-6">
              <h3 className="mb-2 font-semibold text-slate-900">사장님 리워드 🎁</h3>
              {rewards === null ? (
                <p className="text-sm text-slate-400">불러오는 중...</p>
              ) : rewards.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
                  아직 등록된 리워드가 없어요
                </p>
              ) : (
                <div className="space-y-1.5">
                  {rewards.map((r) => {
                    const achieved = myStamps >= r.stamp_threshold
                    const claimStatus = claimsByReward[r.id]
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                      >
                        <p className="text-sm text-amber-800">
                          <b>스탬프 {r.stamp_threshold}개</b> → {rewardLabel(r)}
                        </p>
                        {achieved && claimStatus === "approved" && (
                          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
                            받음 ✅
                          </span>
                        )}
                        {achieved && claimStatus === "pending" && (
                          <span className="rounded-full bg-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            요청됨
                          </span>
                        )}
                        {achieved && !claimStatus && (
                          <button
                            onClick={() => handleClaim(r.id)}
                            disabled={claimingId === r.id}
                            className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white active:bg-amber-600 disabled:opacity-60"
                          >
                            {claimingId === r.id ? "요청 중..." : "수령하기"}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* 인증 버튼 */}
          <div className="px-5 pt-6 lg:px-0">
            <button
              onClick={onCheckin}
              className="w-full rounded-2xl bg-amber-500 py-4 font-semibold text-white active:bg-amber-600"
            >
              📸 방문 인증하기
            </button>
          </div>
        </div>

        <div>
          {/* 방문 랭킹 — 이 매장에서 승인된 체크인 기준 실제 데이터. 프로필을 눌러도 뱃지만 보여줌 (동선 노출 방지) */}
          <div className="px-5 pt-6 lg:px-0 lg:pt-0">
            <h3 className="mb-2 font-semibold text-slate-900">방문 랭킹</h3>
            {ranking === null ? (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            ) : ranking.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
                아직 방문 인증 기록이 없어요
              </p>
            ) : (
              <div className="space-y-1.5">
                {ranking.slice(0, 20).map((v, i) => (
                  <button
                    key={v.user_id}
                    onClick={() => onSelectProfile(v)}
                    className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-left"
                  >
                    <span className="text-slate-700">
                      <b className="mr-2 text-amber-600">{i + 1}위</b>
                      {v.nickname}
                    </span>
                    <span className="text-sm text-slate-400">{v.count}회</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 손님이 보낸 사진 — 승인된 인증 사진 중 공개에 동의한 것만 */}
          <div className="px-5 pt-6 lg:px-0">
            <h3 className="mb-2 font-semibold text-slate-900">손님이 보낸 사진</h3>
            {photos === null ? (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            ) : photos.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
                아직 공개된 인증 사진이 없어요
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPhoto(p)}
                    className="aspect-square overflow-hidden rounded-xl bg-slate-100"
                  >
                    <img src={p.photo_url} alt={p.purpose || "인증 사진"} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 사진 크게 보기 — 바깥 탭하면 닫힘 */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-6 right-5 text-3xl text-white"
          >
            ✕
          </button>
          <img
            src={selectedPhoto.photo_url}
            alt={selectedPhoto.purpose || "인증 사진"}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  )
}
