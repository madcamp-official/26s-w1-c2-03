import { checkNickname } from "./api"

// 랜덤 닉네임 생성용 단어 목록 — 수식어 + 색깔 + 동물
const ADJECTIVES = ["용감한", "행복한", "느긋한", "배고픈", "졸린", "신나는", "수줍은", "당당한", "궁금한", "엉뚱한"]
const COLORS = ["빨간", "파란", "노란", "초록", "보라", "주황", "하얀", "까만", "분홍", "하늘색"]
const ANIMALS = ["여우", "호랑이", "펭귄", "토끼", "다람쥐", "고양이", "강아지", "곰", "돌고래", "부엉이"]

export function randomNickname() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const c = COLORS[Math.floor(Math.random() * COLORS.length)]
  const n = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${a} ${c} ${n}`
}

// 후보를 최대 5번 시도해서 안 겹치는 닉네임을 찾아줌 (다 겹치거나 확인 자체가 실패하면 마지막 후보 그대로)
export async function suggestAvailableNickname(excludeUserId) {
  for (let i = 0; i < 5; i++) {
    const candidate = randomNickname()
    try {
      const { available } = await checkNickname(candidate, excludeUserId)
      if (available) return candidate
    } catch {
      return candidate
    }
  }
  return randomNickname()
}
