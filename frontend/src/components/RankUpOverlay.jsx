import { useEffect, useState } from "react"
import { TIER_META } from "../lib/tier"
import { emojiFor } from "../lib/categoryMeta"

const HEX_CLIP = "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)"

// 롤 승급전 연출 참고 — 카테고리 티어가 오르면 화면 전체를 덮는 축하 연출.
// 데모해보고 별로면: 이 파일 + rankUpTracker.js 삭제, MyPageScreen.jsx에서
// detectRankUps/RankUpOverlay 관련 줄만 지우면 깔끔하게 원복된다.
export default function RankUpOverlay({ category, tier, onDone }) {
  const [closing, setClosing] = useState(false)
  const meta = TIER_META[tier]

  useEffect(() => {
    const timer = setTimeout(() => setClosing(true), 2600)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(onDone, 300)
    return () => clearTimeout(timer)
  }, [closing, onDone])

  if (!meta) return null

  return (
    <div
      onClick={() => setClosing(true)}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 transition-opacity duration-300"
      style={{ opacity: closing ? 0 : 1 }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 160,
          height: 160,
          clipPath: HEX_CLIP,
          background: meta.gradient,
          boxShadow: meta.glow ? `0 0 60px 16px ${meta.glow}` : "0 0 40px 10px rgba(255,255,255,0.25)",
          animation: "rankup-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <span style={{ fontSize: 64 }}>{emojiFor(category)}</span>
      </div>
      <p
        className="mt-6 text-4xl font-black tracking-wide text-white"
        style={{ animation: "rankup-text-in 0.5s ease-out 0.3s both" }}
      >
        RANK UP!
      </p>
      <p
        className="mt-2 text-lg font-semibold text-white"
        style={{ animation: "rankup-text-in 0.5s ease-out 0.45s both" }}
      >
        {category} · {meta.label} 달성
      </p>
      <p className="mt-8 text-xs text-white/50">화면을 탭하면 닫혀요</p>
    </div>
  )
}
