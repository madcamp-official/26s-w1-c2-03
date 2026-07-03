# 맛짱 (Matzzang) — 26s-w1-c2-03

> 맛집을 방문하고 사진으로 인증해 **뱃지를 모으고 랭킹을 정복**하는 포켓몬고식 오프라인 탐험 게임.
> 사장님에겐 단골을 게임처럼 만들어주는 B2B 마케팅 도구.

## 공통과제 I : 웹 기반 프로젝트 (2인 1팀)

**목적:** 공통 과제를 함께 수행하며 웹 개발의 전체 흐름을 빠르게 익히고 협업에 적응하기

**결과물:** 기획부터 배포까지 완료된 웹 서비스와 관련 문서 일체

---

## 팀원

| 이름 | GitHub | 역할 |
|---|---|---|
| 김민재 |  | 프론트엔드 (React · Vite · Tailwind) |
| 원건희 |  | 백엔드 (FastAPI · Supabase) |

---

## 기술 스택

| 구분 | 스택 |
|---|---|
| 프론트엔드 | React, Vite, Tailwind CSS, Leaflet(지도, 추후 네이버 지도 교체 예정) |
| 백엔드 | Python, FastAPI, Supabase(PostgreSQL) |
| 배포 | Vercel(FE) — 예정 |

---

## 기획안

> 상세 기획: [기획서.md](기획서.md)

- **주제:** 맛집 방문을 사진으로 인증해 뱃지·랭킹을 모으는 게임형 맛집 탐험 서비스
- **목적:** 손님에겐 "방문이 게임이 되는" 재미와 리워드를, 사장님에겐 단골을 게임처럼 관리하는 저비용 마케팅 도구 제공
- **핵심 작동:** QR/앱에서 음식 사진 촬영 → **사장님이 카운터에서 수락** → 스탬프·뱃지·랭킹 반영 → 월별 랭킹 상위에게 사장님 리워드
- **차별점:** 사장님이 직접 승인·보상하는 구조(조작 방지 + B2B 훅). 국내엔 "뱃지 수집 게임 + 사장님 랭킹 리워드"를 정면으로 하는 서비스가 없음
- **예상 사용자:**
  - 손님: 맛집 탐방·수집을 즐기는 사용자
  - 사장님: 단골을 늘리고 싶은 카페·음식점 점주

---

## 기능 명세서

> 현재 진행 상황: **프론트엔드 화면(뼈대) 구현 완료** (목데이터 기반) · 백엔드 연동 예정

### 필수 기능

- [x] 회원가입 / 로그인 (아이디·비밀번호·닉네임)
- [x] 홈: 지역(시/도·구) 선택 또는 내 위치 기준 가까운 순 + 카테고리 필터
- [x] 지도: 등록 매장 핀 표시, 방문한 곳 강조, 내 위치·거리, 핀 클릭 → 매장 페이지
- [x] 매장 상세: 정보·내 스탬프·방문 랭킹·사장님 리워드
- [x] 방문 인증: 음식 사진 + 방문 목적 선택 → 사장님 수락 대기
- [x] 마이페이지: 프로필·뱃지·방문 기록(정복 지도)
- [ ] 사장님 대시보드: 매장 등록, 인증 수락/거절, 방문 통계, 리워드 등록
- [ ] 백엔드 API 연동 (현재는 목데이터)

### 선택 기능

- [ ] 월별 랭킹 리워드 자동 지급
- [ ] 자체 리뷰 및 '리뷰왕' 칭호
- [ ] 네이버 지도 API 연동 (현재 Leaflet)
- [ ] 방문 인증 조작 방지 (GPS 반경 체크 등)

---

## IA 및 화면 설계서

> Figma 디자인 작업 예정. 현재 구현된 손님 앱 화면 구조:

```
[로그인 / 회원가입]
        │ (로그인)
        ▼
┌──────────────────────────────┐
│  하단 탭: 홈 / 지도 / 마이       │
├──────────────────────────────┤
│ 홈(매장 목록) ──▶ 매장 상세 ──▶ 방문 인증 ──▶ 수락 대기 │
│ 지도(핀)     ──▶ 매장 상세                              │
│ 마이(정복 지도·뱃지·기록·로그아웃)                       │
└──────────────────────────────┘
```

<!-- Figma 링크 또는 이미지 첨부 예정 -->

---

## DB 스키마

> 상세: [DB스키마.md](DB스키마.md)

주요 테이블: `owners`(사장님) · `stores`(매장) · `users`(손님) · `checkins`(방문 인증) ·
`badges` / `user_badges`(뱃지) · `rewards` / `user_rewards`(리워드) · `reviews`(리뷰)

<!-- ERD 이미지 첨부 예정 -->

---

## API 문서

> 상세: [API명세.md](API명세.md)

| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/auth/signup` | 회원가입 |
| POST | `/auth/login` | 로그인 |
| POST | `/stores` | 매장 등록 (사장님) |
| GET | `/stores` | 매장 목록 (지역·카테고리 필터) |
| POST | `/checkins` | 방문 인증 올리기 (사진 + 목적) |
| GET | `/stores/{store_id}/checkins?status=pending` | 대기 중인 인증 요청 |
| PATCH | `/checkins/{checkin_id}` | 인증 수락 / 거절 |
| GET | `/users/{user_id}/badges` | 내 뱃지 |
| GET | `/stores/{store_id}/ranking` | 매장 방문 랭킹 |

---

## 배포 결과물

- **서비스 URL:** 배포 예정 (Vercel)
- **실행 방법:**

```bash
# 프론트엔드
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## 회고 문서

> KPT 방법론 (개발 종료 후 작성)

### Keep

### Problem

### Try

---

## 참고 자료

- [SDD(스펙 주도 개발) 이해하기](https://news.hada.io/topic?id=21338)
- [Software Design Document Best Practices](https://www.atlassian.com/work-management/project-management/design-document)
- [IA 정보구조도 작성 방법](https://brunch.co.kr/@nyonyo/7)
- [기획자 화면설계서 작성법](https://brunch.co.kr/@soup/10)
- [Figma 와이어프레임 가이드](https://www.figma.com/ko-kr/resource-library/what-is-wireframing/)
- [무료 Figma 와이어프레임 키트](https://www.figma.com/ko-kr/templates/wireframe-kits/)
- [ERD/DB 설계 총정리](https://inpa.tistory.com/entry/DB-%F0%9F%93%9A-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8%EB%A7%81-%EA%B0%9C%EB%85%90-ERD-%EB%8B%A4%EC%9D%B4%EC%96%B4%EA%B7%B8%EB%9E%A8)
- [API 명세서 작성 가이드라인](https://velog.io/@sebinChu/BackEnd-API-%EB%AA%85%EC%84%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%9D%BC%EC%9D%B8)
- [좋은 README 작성하는 방법](https://velog.io/@sabo/good-readme)
- [단기 프로젝트 회고 KPT 방법론](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)
