# API 명세 — 맛짱 (Matzzang)

> FE·BE 공용 계약서. "프론트가 서버에 보내는 심부름 목록"
> 이 명세대로 B는 FastAPI로 엔드포인트를 만들고, A는 이 형식으로 요청을 보냄.

---

## 0. 기초 개념 (처음이면 여기부터)

**API 하나 = 주소(URL) + 방식(method) + 보내는 데이터 + 받는 데이터**

| 방식(method) | 뜻 | 예시 |
|---|---|---|
| GET | 조회 (읽기) | 매장 목록 보기 |
| POST | 생성 (새로 만들기) | 방문 인증 올리기 |
| PATCH | 수정 (일부 바꾸기) | 인증 수락으로 상태 변경 |
| DELETE | 삭제 | (MVP에선 거의 안 씀) |

- **Base URL (개발)**: `http://localhost:8000`
- 요청/응답 본문은 모두 **JSON** (사진 업로드만 예외 — 파일이라 form-data)
- **성공** 응답: 200(조회/수정) / 201(생성), **실패**: 400·404 등
- `{store_id}` 처럼 중괄호는 **실제 값이 들어갈 자리** (예: `/stores/abc-123`)
- FastAPI는 서버를 켜면 `http://localhost:8000/docs` 에서 **API 문서가 자동 생성**됨 → B가 여기서 테스트 가능

**우선순위 표기**: 🔴 핵심(먼저) / 🟡 게임요소 / ⚪ 여유 시

---

## 인증 (Auth) API

회원가입·로그인. 로그인 성공 시 서버가 **토큰(token)** 을 발급 → 이후 요청 헤더에 실어
"내가 누구인지"를 증명한다. (매번 아이디/비번을 다시 보내지 않아도 됨)

### 🔴 AUTH-1. 회원가입 — `POST /auth/signup`
> 서버: 아이디 중복 확인 → 비밀번호는 **암호화(해시)해서 저장** → 계정 생성 → 토큰 발급
```
요청 body:  { "login_id": "foodking", "password": "pw1234", "nickname": "라멘킹" }
응답 201:   {
  "user": { "id": "user-1", "nickname": "라멘킹" },
  "token": "eyJhbGciOi..."
}
실패 409:   { "detail": "이미 사용 중인 아이디입니다" }
```

### 🔴 AUTH-2. 로그인 — `POST /auth/login`
> 서버: 아이디/비번 확인 → 맞으면 토큰 발급
```
요청 body:  { "login_id": "foodking", "password": "pw1234" }
응답 200:   {
  "user": { "id": "user-1", "nickname": "라멘킹" },
  "token": "eyJhbGciOi..."
}
실패 401:   { "detail": "아이디 또는 비밀번호가 올바르지 않습니다" }
```

### 인증이 필요한 요청 — 헤더에 토큰 실기
```
Authorization: Bearer eyJhbGciOi...
```
- 로그인 후 받은 `token`을 이후 요청의 헤더에 넣어 보냄 → 서버가 누구인지 앎
- 덕분에 방문 인증(`POST /checkins`) 등에서 `user_id`를 직접 안 보내도 토큰으로 식별 가능

> ⚠️ **스키마 반영 필요**: `users`(와 로그인하는 `owners`) 테이블에 `login_id`, `password_hash` 컬럼 추가 필요.
> 비밀번호 원문은 절대 저장하지 않고 **해시값(password_hash)**만 저장한다. (DB스키마.md 업데이트 대상)

---

## A. 사장님(Owner) API

### 🔴 A-1. 사장님 가입 — `POST /owners`
```
요청 body:  { "email": "boss@cafe.com", "name": "김사장" }
응답 201:   { "id": "own-1", "email": "boss@cafe.com", "name": "김사장" }
```

### 🔴 A-2. 매장 등록 — `POST /stores`
> 사장님은 이름·주소·카테고리·키워드만 입력. 서버가 주소→좌표(lat/lng) 자동 변환.
```
요청 body:  {
  "owner_id": "own-1",
  "name": "성수동 카페",
  "address": "서울 성동구 성수동 123",
  "category": "카페",
  "keywords": ["조용한", "디저트맛집"]
}
응답 201:   {
  "id": "store-1", "name": "성수동 카페", "address": "서울 성동구 성수동 123",
  "category": "카페", "keywords": ["조용한", "디저트맛집"],
  "lat": 37.544, "lng": 127.056
}
```

### 🔴 A-3. 내 매장 목록 — `GET /owners/{owner_id}/stores`
```
응답 200:   [ { "id": "store-1", "name": "성수동 카페", "category": "카페" }, ... ]
```

### 🔴 A-4. 대기중인 인증 요청 — `GET /stores/{store_id}/checkins?status=pending`
> 사장님 수락 화면에서 사용. status 값으로 필터(pending/approved).
```
응답 200:   [
  {
    "id": "chk-1",
    "user": { "id": "user-1", "nickname": "먹짱" },
    "photo_url": "https://.../food.jpg",
    "purpose": "카공",
    "created_at": "2026-07-03T14:20:00Z"
  }, ...
]
```

### 🔴 A-5. 인증 수락 / 거절 — `PATCH /checkins/{checkin_id}`
```
요청 body:  { "status": "approved" }     // 또는 "rejected"
응답 200:   { "id": "chk-1", "status": "approved", "reviewed_at": "2026-07-03T14:21:00Z" }
```

### ⚪ A-6. 매장 대시보드 통계 — `GET /stores/{store_id}/dashboard`
```
응답 200:   {
  "total_checkins": 87,
  "visitor_ranking": [ { "nickname": "먹짱", "count": 12, "rank": 1 }, ... ],
  "purpose_distribution": { "카공": 40, "혼밥": 25, "외식": 22 }
}
```

### ⚪ A-7. 리워드 등록 — `POST /stores/{store_id}/rewards`
```
요청 body:  {
  "title": "아메리카노 무료", "description": "월간 1~3위 대상",
  "type": "monthly_rank", "rank_threshold": 3
}
응답 201:   { "id": "rwd-1", "title": "아메리카노 무료", "type": "monthly_rank" }
```

---

## B. 손님(User) API

### ~~B-1. 유저 생성 — `POST /users`~~ → **AUTH-1(회원가입)으로 대체됨**
> 로그인/회원가입을 도입하면서 유저 생성은 `POST /auth/signup`이 담당한다. (위 인증 섹션 참고)

### 🔴 B-2. 매장 목록 (지도) — `GET /stores?category=카페&keyword=조용한`
> 필터는 선택. 없으면 전체. 지도 핀 표시용 lat/lng 포함.
```
응답 200:   [
  {
    "id": "store-1", "name": "성수동 카페", "category": "카페",
    "keywords": ["조용한", "디저트맛집"], "lat": 37.544, "lng": 127.056
  }, ...
]
```

### 🟡 B-3. 매장 상세 — `GET /stores/{store_id}`
```
응답 200:   {
  "id": "store-1", "name": "성수동 카페", "category": "카페",
  "top_visitors": [ { "nickname": "먹짱", "count": 12 }, ... ],
  "rewards": [ { "title": "아메리카노 무료", "type": "monthly_rank" } ]
}
```

### 🔴 B-4. 방문 인증 올리기 — `POST /checkins`  *(multipart/form-data)*
> 사진 파일이라 JSON이 아닌 form-data. 서버가 사진을 Supabase Storage에 저장 후 checkin 생성(status=pending).
```
요청 (form-data):
  photo:    (이미지 파일)
  user_id:  "user-1"
  store_id: "store-1"
  purpose:  "카공"
응답 201:   { "id": "chk-1", "status": "pending", "photo_url": "https://.../food.jpg" }
```

### 🔴 B-5. 내 인증 상태 확인 — `GET /checkins/{checkin_id}`
> 사장님이 수락했는지 확인 (pending → approved). ※ 실시간 반영은 아래 Realtime 참고.
```
응답 200:   { "id": "chk-1", "status": "approved" }
```

### 🟡 B-6. 내 기록 / 정복 지도 — `GET /users/{user_id}/history`
```
응답 200:   {
  "total_stamps": 34,
  "stores_visited": [ { "store_id": "store-1", "name": "성수동 카페", "count": 12 }, ... ]
}
```

### 🟡 B-7. 내 뱃지 — `GET /users/{user_id}/badges`
```
응답 200:   [ { "id": "bdg-1", "name": "카공 마스터", "icon": "☕", "earned_at": "..." }, ... ]
```

### 🟡 B-8. 매장 방문 랭킹 — `GET /stores/{store_id}/ranking`
```
응답 200:   [ { "rank": 1, "nickname": "먹짱", "count": 12 }, ... ]
```

### ⚪ B-9. 리뷰 작성 — `POST /stores/{store_id}/reviews`
```
요청 body:  { "user_id": "user-1", "rating": 5, "content": "분위기 최고" }
응답 201:   { "id": "rev-1", "rating": 5, "content": "분위기 최고" }
```

### ⚪ B-10. 내 쿠폰 — `GET /users/{user_id}/rewards`
```
응답 200:   [ { "id": "urwd-1", "title": "아메리카노 무료", "status": "issued" }, ... ]
```

---

## Realtime (실시간) — 폴링 대신 권장

핵심 루프의 "사장님 수락 → 손님 화면 즉시 반응"은 API를 반복 호출(polling)하는 대신
**Supabase Realtime**으로 `checkins` 테이블 변화를 구독하면 즉시 반영됨.

- 사장님 대시보드: `checkins` insert(새 요청) 실시간 수신 → A-4를 계속 호출 안 해도 됨
- 손님 화면: 내 checkin의 status가 approved로 바뀌면 실시간 수신 → B-5 반복 호출 불필요

MVP 초반엔 간단하게 GET 반복(polling)으로 만들고, 여유 있을 때 Realtime으로 교체해도 됨.

---

## 고정 선택지 (FE·BE 합의)

| 항목 | 값 |
|---|---|
| category (매장) | 카페 / 한식 / 중식 / 일식 / 양식 / 분식 / 디저트 / 주점 |
| purpose (방문목적) | 외식 / 카공 / 혼밥 / 혼술 / 회식 / 데이트 / 모임 |
| checkin status | pending / approved / rejected |
| reward type | instant_stamp / monthly_rank |

---

## MVP 최소 세트 (이것만 되면 데모 성립)

A-2(매장등록) → B-2(매장목록) → B-4(인증올리기) → A-4(대기목록) → A-5(수락) → B-5(상태확인)
= **매장 등록부터 사진 인증·수락까지 한 바퀴**
