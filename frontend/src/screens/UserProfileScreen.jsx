// 다른 유저 프로필 (매장 방문 랭킹에서 진입) — 획득한 뱃지만 보여줌
// 매장별 방문 기록/횟수는 일부러 노출하지 않음 (동선이 그대로 드러나는 걸 막기 위함)
import { useEffect, useState } from "react"
import { getUserBadges } from "../lib/api"

export default function UserProfileScreen({ profileUser, onBack }) {
  const [badges, setBadges] = useState(null)

  useEffect(() => {
    if (!profileUser) return
    setBadges(null)
    getUserBadges(profileUser.user_id)
      .then(setBadges)
      .catch(() => setBadges([]))
  }, [profileUser])

  if (!profileUser) return null

  const earnedBadges = (badges || []).filter((b) => b.earned)

  return (
    <div className="pb-4">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">프로필</h1>
      </header>

      <div className="px-5">
        <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-5 text-white">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-500 text-2xl">
            {profileUser.profile_image_url ? (
              <img src={profileUser.profile_image_url} alt={profileUser.nickname} className="h-full w-full object-cover" />
            ) : (
              "😋"
            )}
          </div>
          <p className="text-lg font-bold">{profileUser.nickname}</p>
        </div>

        <section className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">획득한 뱃지</h3>
          {badges === null ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : earnedBadges.length === 0 ? (
            <p className="text-sm text-slate-400">아직 획득한 뱃지가 없어요</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {earnedBadges.map((b) => (
                <div key={b.id} className="flex flex-col items-center gap-1 rounded-2xl bg-amber-50 p-3">
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
      </div>
    </div>
  )
}
