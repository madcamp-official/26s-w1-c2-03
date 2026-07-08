// 랭크업 연출 트리거 감지 — 마지막으로 본 티어를 로컬에 저장해두고, 새로 불러온 티어가
// 더 높으면 "승급"으로 판단해서 RankUpOverlay를 띄운다.
// 데모해보고 별로면: 이 파일 + RankUpOverlay.jsx 삭제, MyPageScreen.jsx에서
// detectRankUps/RankUpOverlay 관련 줄만 지우면 깔끔하게 원복된다.
import { TIER_ORDER } from "./tier"

function storageKey(userId) {
  return `matzzang:seenTiers:${userId}`
}

function loadSeenTiers(userId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId))) || {}
  } catch {
    return {}
  }
}

// categoryTiers: [{category, tier, total_stamps}, ...] (tier는 미달성이면 null)
// 반환값: 이번에 새로 오르거나 처음 달성한 티어 목록. 호출 즉시 "본 것"으로 기록해 다음엔 다시 안 뜬다.
export function detectRankUps(userId, categoryTiers) {
  const seen = loadSeenTiers(userId)
  const promotions = []

  for (const { category, tier } of categoryTiers) {
    if (!tier) continue
    const prevRank = seen[category] ? TIER_ORDER.indexOf(seen[category]) : -1
    if (TIER_ORDER.indexOf(tier) > prevRank) {
      promotions.push({ category, tier })
    }
  }

  const nextSeen = { ...seen }
  for (const { category, tier } of categoryTiers) {
    if (tier) nextSeen[category] = tier
  }
  localStorage.setItem(storageKey(userId), JSON.stringify(nextSeen))

  return promotions
}
