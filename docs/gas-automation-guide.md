# 수학비서 강의 자동화 - Google Apps Script 가이드

## 전체 자동화 구조

```
                    Google Apps Script (무료)
                    ┌─────────────────────────────────┐
                    │                                 │
[랜딩페이지 폼] ──→ │  ① doPost() - 신청 접수         │ → Google Sheets 기록
                    │     └→ 확인 메일 자동 발송       │ → Gmail 발송
                    │                                 │
   (트리거: 매주 금)│  ② sendFridayReminder()         │ → Gmail 발송
   (트리거: 매주 월)│  ③ sendMondayReminder()         │ → Gmail 발송
   (트리거: 매주 화)│  ④ sendReviewRequest()          │ → Gmail 발송
   (트리거: 매주 수)│  ⑤ sendReviewReminder()         │ → Gmail (미작성자만)
                    │                                 │
[후기 폼] ────────→ │  ⑥ doPost() - 후기 접수         │ → Google Sheets 기록
                    │     └→ 감사 메일 자동 발송       │ → Gmail 발송
                    └─────────────────────────────────┘
```

## 필요한 Google 리소스

| 리소스 | 용도 | 비용 |
|--------|------|------|
| Google Sheets | 신청자 DB, 후기 DB | 무료 |
| Google Apps Script | 자동화 로직 전체 | 무료 |
| Gmail | 메일 발송 (일 100통) | 무료 |
| Google Calendar | 강의 일정 초대 (선택) | 무료 |

**총 비용: 0원**

## 설정 순서

### Step 1: Google Sheets 생성
1. Google Sheets 새 문서 생성
2. 시트 이름을 아래와 같이 설정:
   - `신청자` : 강의 신청 데이터
   - `후기` : 강의 후기 데이터
   - `설정` : 메일 템플릿, Zoom 링크 등

### Step 2: Apps Script 연결
1. Sheets 상단 메뉴 → 확장 프로그램 → Apps Script
2. `gas/Code.gs` 파일 내용을 붙여넣기
3. 저장

### Step 3: 웹앱 배포
1. Apps Script 에디터 → 배포 → 새 배포
2. 유형: 웹 앱
3. 실행 계정: 나
4. 액세스: 모든 사용자
5. 배포 → URL 복사

### Step 4: 랜딩페이지 연결
1. `index.html`의 `GOOGLE_APPS_SCRIPT_URL` 부분에 복사한 URL 붙여넣기

### Step 5: 트리거 설정
1. Apps Script 에디터 → 트리거 (시계 아이콘)
2. 아래 트리거 추가:

| 함수 | 이벤트 소스 | 유형 | 시간 |
|------|-----------|------|------|
| sendFridayReminder | 시간 기반 | 주간 타이머 | 금요일 09:00 |
| sendMondayMorningReminder | 시간 기반 | 주간 타이머 | 월요일 09:00 |
| sendMondayFinalReminder | 시간 기반 | 주간 타이머 | 월요일 21:00 |
| sendReviewRequest | 시간 기반 | 주간 타이머 | 화요일 00:00 |
| sendReviewReminder | 시간 기반 | 주간 타이머 | 수요일 12:00 |

## Gmail 일일 발송 한도

| 계정 유형 | 일일 한도 |
|----------|----------|
| 일반 Gmail | 100통/일 |
| Google Workspace | 1,500통/일 |

→ 초기 50명 규모에서는 일반 Gmail로 충분합니다.
→ 100명 이상 시 Google Workspace($6/월) 권장

## 카카오 알림톡 연동 (선택사항)

Gmail만으로 기본 자동화는 완성되지만,
알림톡까지 원하시면 솔라피 API를 Apps Script에서 호출할 수 있습니다.
(`gas/Code.gs`의 솔라피 연동 섹션 참고)
