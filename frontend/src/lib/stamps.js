import { getCheckins } from "./api"

// 유저가 승인받은 체크인을 매장별로 묶어서 스탬프 합계를 낸 것 { storeId: stampCount }
// HomeScreen 리스트/MapScreen 핀에서 "방문 여부·스탬프 개수"를 표시할 때 공용으로 사용
export async function getStampsByStore(userId) {
  const checkins = await getCheckins({ userId, status: "approved" })
  const map = {}
  for (const c of checkins) {
    map[c.store_id] = (map[c.store_id] ?? 0) + (c.stamp_count ?? 1)
  }
  return map
}
