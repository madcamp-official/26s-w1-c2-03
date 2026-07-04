// 서버가 아직 없어서 쓰는 가짜 데이터.
// 나중에 실제 API(fetch) 응답으로 이 자리를 바꾸면 됨. (API명세.md 참고)

export const currentUser = {
  id: "user-1",
  nickname: "먹짱",
  totalStamps: 34,
}

export const categories = ["전체", "카페", "한식", "일식", "양식", "분식", "디저트", "주점"]

export const purposes = ["외식", "카공", "혼밥", "혼술", "회식", "데이트", "모임"]

// 지역 선택용 (시/도 → 구). 나중에 네이버 지오코딩으로 확장 가능.
export const regions = {
  서울특별시: ["성동구", "강남구", "마포구", "종로구", "용산구"],
  경기도: ["성남시", "수원시", "고양시", "부천시"],
  부산광역시: ["해운대구", "부산진구", "수영구"],
}

export const stores = [
  {
    id: "store-1",
    name: "성수동 감성카페",
    category: "카페",
    address: "서울 성동구 성수동 123",
    sido: "서울특별시",
    gu: "성동구",
    lat: 37.5445,
    lng: 127.0557,
    keywords: ["조용한", "디저트맛집"],
    image: "🍰",
    myStamps: 5,
    myRank: 2,
    topVisitors: [
      { rank: 1, nickname: "카페왕", count: 18 },
      { rank: 2, nickname: "먹짱", count: 5 },
      { rank: 3, nickname: "라떼러버", count: 4 },
    ],
    rewards: [{ title: "아메리카노 무료", desc: "월간 방문 1~3위 대상", type: "monthly_rank" }],
  },
  {
    id: "store-2",
    name: "왕돈까스",
    category: "일식",
    address: "서울 성동구 왕십리로 45",
    sido: "서울특별시",
    gu: "성동구",
    lat: 37.5478,
    lng: 127.0470,
    keywords: ["가성비", "든든한"],
    image: "🍤",
    myStamps: 3,
    myRank: 5,
    topVisitors: [
      { rank: 1, nickname: "돈까스헌터", count: 22 },
      { rank: 2, nickname: "점심러", count: 15 },
      { rank: 3, nickname: "먹짱", count: 3 },
    ],
    rewards: [{ title: "치즈까스 업그레이드", desc: "스탬프 10개 모으면", type: "instant_stamp" }],
  },
  {
    id: "store-3",
    name: "혼밥국밥",
    category: "한식",
    address: "서울 성동구 성수이로 8",
    sido: "서울특별시",
    gu: "성동구",
    lat: 37.5432,
    lng: 127.0555,
    keywords: ["혼밥환영", "국물맛집"],
    image: "🍲",
    myStamps: 8,
    myRank: 1,
    topVisitors: [
      { rank: 1, nickname: "먹짱", count: 8 },
      { rank: 2, nickname: "국밥마니아", count: 6 },
      { rank: 3, nickname: "아침형인간", count: 5 },
    ],
    rewards: [{ title: "공기밥 무료", desc: "월간 방문 1위 대상", type: "monthly_rank" }],
  },
  {
    id: "store-4",
    name: "성수 수제버거",
    category: "양식",
    address: "서울 성동구 연무장길 30",
    sido: "서울특별시",
    gu: "성동구",
    lat: 37.5461,
    lng: 127.0533,
    keywords: ["데이트", "수제패티"],
    image: "🍔",
    myStamps: 0,
    myRank: null,
    topVisitors: [
      { rank: 1, nickname: "버거킹덤", count: 12 },
      { rank: 2, nickname: "치즈러버", count: 9 },
      { rank: 3, nickname: "금요일밤", count: 7 },
    ],
    rewards: [{ title: "감자튀김 무료", desc: "스탬프 5개 모으면", type: "instant_stamp" }],
  },
]

// 사장님 대시보드 — 대기 중인 방문 인증 요청 (가짜 데이터)
// 나중에 실제 API로 교체: GET /stores/{store_id}/checkins?status=pending (API명세.md A-4)
export const pendingCheckins = [
  {
    id: "chk-101",
    storeName: "성수동 감성카페",
    nickname: "라떼러버",
    purpose: "카공",
    photoEmoji: "☕",
    requestedAt: "방금 전",
    status: "pending",
  },
  {
    id: "chk-102",
    storeName: "성수동 감성카페",
    nickname: "카페왕",
    purpose: "혼밥",
    photoEmoji: "🍰",
    requestedAt: "3분 전",
    status: "pending",
  },
  {
    id: "chk-103",
    storeName: "왕돈까스",
    nickname: "돈까스헌터",
    purpose: "외식",
    photoEmoji: "🍤",
    requestedAt: "12분 전",
    status: "pending",
  },
]

export const badges = [
  { id: "b1", name: "카페 마스터", icon: "☕", desc: "카페 20곳 방문", earned: true },
  { id: "b2", name: "성수동 정복", icon: "🏙️", desc: "성수동 10곳 방문", earned: true },
  { id: "b3", name: "혼밥러", icon: "🍚", desc: "혼밥 인증 50회", earned: true },
  { id: "b4", name: "카공 마스터", icon: "💻", desc: "카공 인증 30회", earned: false },
  { id: "b5", name: "미식 탐험가", icon: "🧭", desc: "새 매장 첫 인증 10회", earned: false },
  { id: "b6", name: "리뷰왕", icon: "✍️", desc: "리뷰 30개 작성", earned: false },
  { id: "b7", name: "회식대장", icon: "🍻", desc: "회식 인증 20회", earned: false },
  { id: "b8", name: "얼리버드", icon: "🌅", desc: "오픈런 인증 15회", earned: false },
]
