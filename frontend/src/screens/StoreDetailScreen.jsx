// 매장 상세 — 정보 + 내 스탬프 + 인증 버튼 + 방문 랭킹 + 리워드
// 리워드는 아직 백엔드에 없어서, 데이터가 있을 때만 섹션을 보여줌 (없으면 숨김, 크래시 방지)
import { useEffect, useState } from "react"
import { getStoreRanking, getStorePhotos, getCheckins } from "../lib/api"

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

export default function StoreDetailScreen({ store, user, onBack, onCheckin, onSelectProfile }) {
  const [ranking, setRanking] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null) // 크게 보기용으로 고른 사진
  const [myStamps, setMyStamps] = useState(0)

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
  }, [store?.id])

  // 이 매장에서 내가 승인받은 체크인들의 스탬프 개수 합 (매장 목록 API엔 안 들어있어서 따로 조회)
  useEffect(() => {
    if (!store || !user) return
    setMyStamps(0)
    getCheckins({ storeId: store.id, userId: user.id, status: "approved" })
      .then((checkins) => setMyStamps(checkins.reduce((sum, c) => sum + (c.stamp_count ?? 1), 0)))
      .catch(() => setMyStamps(0))
  }, [store?.id, user?.id])

  if (!store) return null

  const categories = store.categories || []
  const keywords = store.keywords || []
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
        {store.image_url ? (
          <img
            src={store.image_url}
            alt={store.name}
            className="h-48 w-full rounded-3xl object-cover"
          />
        ) : (
          <div className="flex items-center justify-center rounded-3xl bg-amber-50 py-10 text-6xl">
            {emojiFor(categories)}
          </div>
        )}

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
            {myStamps}개
            {store.myRank ? ` · 현재 ${store.myRank}위 🏅` : ""}
          </p>
        </div>

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

      {/* 방문 랭킹 — 이 매장에서 승인된 체크인 기준 실제 데이터. 프로필을 눌러도 뱃지만 보여줌 (동선 노출 방지) */}
      <div className="px-5 pt-6">
        <h3 className="mb-2 font-semibold text-slate-900">방문 랭킹</h3>
        {ranking === null ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-slate-400">아직 방문 인증 기록이 없어요</p>
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
      <div className="px-5 pt-6">
        <h3 className="mb-2 font-semibold text-slate-900">손님이 보낸 사진</h3>
        {photos === null ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-slate-400">아직 공개된 인증 사진이 없어요</p>
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
