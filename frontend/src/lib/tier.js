// 티어 표시용 메타데이터 — 실제 티어 계산(누적 스탬프 개수, 카테고리 내 상위 10명 여부)은
// 서버(get_user_category_tiers)가 하고, 프론트는 리그오브레전드 랭크 토큰 느낌의 색/그라디언트만 담당한다.
export const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond", "challenger"]

export const TIER_META = {
  bronze: {
    label: "브론즈",
    textColor: "#8a5a2b",
    gradient: "linear-gradient(135deg, #8a5a2b 0%, #c98a54 50%, #7a4a20 100%)",
    innerGradient: "linear-gradient(135deg, #d9a066 0%, #a86b34 100%)",
  },
  silver: {
    label: "실버",
    textColor: "#64748b",
    gradient: "linear-gradient(135deg, #94a3b8 0%, #e2e8f0 50%, #7c8896 100%)",
    innerGradient: "linear-gradient(135deg, #eef2f6 0%, #b8c2cc 100%)",
  },
  gold: {
    label: "골드",
    textColor: "#a16207",
    gradient: "linear-gradient(135deg, #b8860b 0%, #ffd76a 50%, #a3730a 100%)",
    innerGradient: "linear-gradient(135deg, #ffe9a8 0%, #e0a83b 100%)",
  },
  platinum: {
    label: "플래티넘",
    textColor: "#0f766e",
    gradient: "linear-gradient(135deg, #2dd4bf 0%, #a7f3e8 50%, #14a394 100%)",
    innerGradient: "linear-gradient(135deg, #d3fbf3 0%, #5eead4 100%)",
  },
  diamond: {
    label: "다이아몬드",
    textColor: "#4c1d95",
    gradient: "linear-gradient(135deg, #4f9dde 0%, #b794f6 50%, #6d28d9 100%)",
    innerGradient: "linear-gradient(135deg, #cfe4fb 0%, #c4b5fd 100%)",
    glow: "rgba(124, 58, 237, 0.45)",
  },
  challenger: {
    label: "챌린저",
    textColor: "#9a3412",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #fb7185 45%, #a21caf 100%)",
    innerGradient: "linear-gradient(135deg, #fff1c1 0%, #fda4af 100%)",
    glow: "rgba(251, 113, 133, 0.6)",
  },
}
