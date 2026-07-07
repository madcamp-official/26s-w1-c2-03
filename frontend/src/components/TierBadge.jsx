import { TIER_META } from "../lib/tier"

const HEX_CLIP = "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)"

// 리그오브레전드 랭크 토큰 참고 — 육각형 메달에 티어별 메탈릭 그라디언트, 챌린저는 발광 테두리
export default function TierBadge({ tier, emoji, label, totalStamps, size = 72 }) {
  const meta = TIER_META[tier]
  if (!meta) return null

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size + 20 }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          clipPath: HEX_CLIP,
          background: meta.gradient,
          boxShadow: meta.glow
            ? `0 0 14px 3px ${meta.glow}`
            : "0 2px 6px rgba(0,0,0,0.25)",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: size - 8,
            height: size - 8,
            clipPath: HEX_CLIP,
            background: meta.innerGradient,
          }}
        >
          <span style={{ fontSize: size * 0.4 }}>{emoji}</span>
        </div>
      </div>
      <div className="text-center leading-tight">
        <p className="text-[11px] font-bold" style={{ color: meta.textColor }}>
          {meta.label}
        </p>
        {label && <p className="text-[10px] text-slate-500">{label}</p>}
        {totalStamps != null && <p className="text-[9px] text-slate-400">{totalStamps}개</p>}
      </div>
    </div>
  )
}
