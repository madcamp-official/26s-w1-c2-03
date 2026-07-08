const SHIELD_CLIP = "polygon(50% 0%, 100% 15%, 100% 55%, 50% 100%, 0% 55%, 0% 15%)"

// 지역 정복 뱃지 — 티어가 없는 달성형 뱃지라, 티어별로 색이 바뀌는 카테고리 뱃지(육각형)나
// 키워드마다 색이 다른 칭호 뱃지와 다르게 방패 모양 + 무채색(회색 계열)으로 통일해서 구분되게 함.
export default function RegionBadge({ type, name, totalStamps, size = 72 }) {
  const icon = type === "city" ? "🏙️" : "🚩"

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size + 24 }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          clipPath: SHIELD_CLIP,
          background: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 50%, #64748b 100%)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: size - 10,
            height: size - 10,
            clipPath: SHIELD_CLIP,
            background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
          }}
        >
          <span style={{ fontSize: size * 0.38 }}>{icon}</span>
        </div>
      </div>
      <div className="text-center leading-tight">
        <p className="text-[11px] font-bold text-slate-600">{name}</p>
        {totalStamps != null && <p className="text-[9px] text-slate-400">{totalStamps}개</p>}
      </div>
    </div>
  )
}
