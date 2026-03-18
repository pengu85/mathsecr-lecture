# 수학비서 강의 자동화 - 단계별 설정 가이드

## 전체 순서 요약

```
Step 1. Google Sheets 만들기
Step 2. Apps Script 붙여넣기
Step 3. 시트 초기화 실행
Step 4. 설정값 입력 (Zoom 링크 등)
Step 5. 웹앱 배포 → URL 받기
Step 6. 랜딩페이지에 URL 연결
Step 7. 트리거 5개 설정 (자동 메일)
Step 8. 테스트
Step 9. 랜딩페이지 배포 (공개)
```

---

## Step 1. Google Sheets 만들기

1. https://sheets.google.com 접속
2. **빈 스프레드시트** 클릭 → 새 문서 생성
3. 문서 이름을 `수학비서 강의 관리`로 변경
4. **URL에서 Sheets ID 복사** (나중에 필요)

```
https://docs.google.com/spreadsheets/d/여기가_SHEETS_ID/edit
                                       ^^^^^^^^^^^^^^^^
                                       이 부분을 복사
```

> 이 시점에서 시트는 비어있어도 됩니다. Step 3에서 자동으로 세팅됩니다.

---

## Step 2. Apps Script 붙여넣기

1. 방금 만든 Sheets 상단 메뉴 → **확장 프로그램** → **Apps Script** 클릭
2. 새 탭에 Apps Script 에디터가 열림
3. 기본으로 있는 `function myFunction() {}` 코드를 **전부 삭제**
4. `gas/Code.gs` 파일의 전체 내용을 **복사 → 붙여넣기**
5. 상단의 **CONFIG** 부분에서 아래 항목 입력:

```javascript
const CONFIG = {
  SPREADSHEET_ID: '여기에_Step1에서_복사한_Sheets_ID_붙여넣기',
  ...
  ZOOM_LINK: '여기에_Zoom_회의_링크_붙여넣기',
  ...
};
```

6. **Ctrl + S** (저장)

---

## Step 3. 시트 초기화 실행 (최초 1회)

이 단계에서 '신청자', '후기', '설정' 시트가 자동으로 만들어집니다.

1. Apps Script 에디터 상단의 함수 선택 드롭다운에서 `initializeSheets` 선택
2. **실행** 버튼(▶) 클릭
3. **권한 승인 팝업**이 뜹니다:
   - "이 앱은 확인되지 않았습니다" → **고급** 클릭
   - "수학비서 강의 관리(으)로 이동(안전하지 않음)" 클릭
   - **허용** 클릭
4. 실행 완료 후 Google Sheets로 돌아가면 시트 3개가 생성되어 있음

### 확인 체크리스트
- [ ] `신청자` 시트 - 헤더 12개 열 확인
- [ ] `후기` 시트 - 헤더 8개 열 확인
- [ ] `설정` 시트 - 키/값 쌍 확인

---

## Step 4. 설정 시트에 강의 정보 입력

Google Sheets의 `설정` 시트를 열고 B열 값을 수정합니다:

| A열 (키) | B열 (값) - 직접 입력 |
|----------|---------------------|
| currentWeek | 1 |
| thisWeekTopic | 클로드코드 기본 세팅 |
| thisWeekDescription | 클로드코드 설치부터 MCP 연결, 클로드 스킬 세팅까지 한 번에 끝내는 시간입니다. |
| preparation | 노트북 또는 데스크톱 |
| zoomLink | (Zoom 링크 입력) |

> 매주 강의 전에 이 시트의 값만 바꿔주면 리마인더 메일 내용이 자동으로 바뀝니다.

---

## Step 5. 웹앱 배포 → URL 받기

이 단계에서 랜딩페이지가 데이터를 보낼 수 있는 URL이 생성됩니다.

1. Apps Script 에디터 → 오른쪽 상단 **배포** → **새 배포**
2. 설정:
   - 유형 옆 ⚙ 클릭 → **웹 앱** 선택
   - 설명: `수학비서 강의 신청 v1`
   - 다음 사용자 인증으로 실행: **나 (본인 이메일)**
   - 액세스 권한: **모든 사용자**
3. **배포** 클릭
4. **웹 앱 URL**이 표시됨 → **복사**

```
https://script.google.com/macros/s/XXXXXXX.../exec
```

> ⚠️ 이 URL을 잘 보관하세요. 랜딩페이지와 후기 페이지 모두에 사용됩니다.

---

## Step 6. 랜딩페이지에 URL 연결

### 6-1. 신청 랜딩페이지 (index.html)

`index.html` 파일을 열고 아래 부분을 찾아서 URL 교체:

```javascript
// 이 줄을 찾으세요 (약 729번째 줄 부근)
const GAS_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL';

// 이렇게 교체
const GAS_URL = 'https://script.google.com/macros/s/XXXXXXX.../exec';
```

### 6-2. 후기 페이지 (review.html)

`review.html` 파일도 동일하게:

```javascript
// 이 줄을 찾으세요
const GAS_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL';

// 같은 URL로 교체
const GAS_URL = 'https://script.google.com/macros/s/XXXXXXX.../exec';
```

### 6-3. Apps Script CONFIG에 후기 폼 URL 입력

나중에 후기 페이지를 배포한 후, 그 URL을 Apps Script CONFIG에도 입력:

```javascript
REVIEW_FORM_URL: 'https://your-domain.com/review.html',
```

> 이 URL은 후기 요청 메일에서 "후기 남기기" 버튼 링크로 사용됩니다.

---

## Step 7. 트리거 5개 설정 (자동 메일 발송)

이 단계가 핵심입니다. 트리거를 설정하면 매주 자동으로 메일이 발송됩니다.

1. Apps Script 에디터 왼쪽 사이드바 → **시계 아이콘** (트리거) 클릭
2. 오른쪽 하단 **+ 트리거 추가** 클릭
3. 아래 5개를 하나씩 추가:

### 트리거 1: 금요일 미리보기
| 항목 | 설정값 |
|------|--------|
| 실행할 함수 | `sendFridayReminder` |
| 이벤트 소스 | 시간 기반 |
| 시간 기반 트리거 유형 | 주간 타이머 |
| 요일 | 금요일 |
| 시간 | 오전 9시~10시 |

### 트리거 2: 월요일 오전 알림
| 항목 | 설정값 |
|------|--------|
| 실행할 함수 | `sendMondayMorningReminder` |
| 이벤트 소스 | 시간 기반 |
| 시간 기반 트리거 유형 | 주간 타이머 |
| 요일 | 월요일 |
| 시간 | 오전 9시~10시 |

### 트리거 3: 월요일 밤 최종 알림
| 항목 | 설정값 |
|------|--------|
| 실행할 함수 | `sendMondayFinalReminder` |
| 이벤트 소스 | 시간 기반 |
| 시간 기반 트리거 유형 | 주간 타이머 |
| 요일 | 월요일 |
| 시간 | 오후 9시~10시 |

### 트리거 4: 화요일 후기 요청
| 항목 | 설정값 |
|------|--------|
| 실행할 함수 | `sendReviewRequest` |
| 이벤트 소스 | 시간 기반 |
| 시간 기반 트리거 유형 | 주간 타이머 |
| 요일 | 화요일 |
| 시간 | 오전 0시~1시 |

### 트리거 5: 수요일 후기 리마인드
| 항목 | 설정값 |
|------|--------|
| 실행할 함수 | `sendReviewReminder` |
| 이벤트 소스 | 시간 기반 |
| 시간 기반 트리거 유형 | 주간 타이머 |
| 요일 | 수요일 |
| 시간 | 오후 12시~1시 |

> 설정 완료 후 트리거 목록에 5개가 보이면 성공!

---

## Step 8. 테스트

### 8-1. 신청 테스트

1. `index.html`을 브라우저에서 열기
2. 본인 정보로 신청 폼 작성 → 제출
3. 확인할 것:
   - [ ] 성공 팝업이 뜨는가?
   - [ ] Google Sheets `신청자` 시트에 데이터가 기록되었는가?
   - [ ] 본인 이메일로 확인 메일이 왔는가?

### 8-2. 후기 테스트

1. `review.html`을 브라우저에서 열기
2. 후기 작성 → 제출
3. 확인할 것:
   - [ ] 감사 화면이 뜨는가?
   - [ ] Google Sheets `후기` 시트에 데이터가 기록되었는가?
   - [ ] 감사 메일이 왔는가?

### 8-3. 리마인더 테스트 (수동)

1. Apps Script 에디터로 이동
2. 함수 선택에서 `sendFridayReminder` 선택 → ▶ 실행
3. 본인 이메일로 리마인더가 오는지 확인

### 8-4. 중복 신청 테스트

1. 같은 이메일로 다시 신청 시도
2. 이미 신청했다는 안내가 뜨는지 확인

### 문제가 생겼을 때

- Apps Script 에디터 → 왼쪽 **실행** 메뉴에서 로그 확인
- "권한" 오류 → Step 3의 권한 승인을 다시 진행
- "시트를 찾을 수 없음" → CONFIG의 SPREADSHEET_ID 확인
- 메일이 안 옴 → Gmail의 보낸 편지함 또는 스팸 확인

---

## Step 9. 랜딩페이지 배포 (공개)

테스트 완료 후, 랜딩페이지를 인터넷에 공개합니다.

### 방법 A: GitHub Pages (무료, 추천)

1. GitHub 가입 (github.com)
2. 새 저장소(repository) 생성: `mathsecr-lecture`
3. `index.html`, `review.html` 업로드
4. Settings → Pages → Source: main branch → Save
5. 몇 분 후 `https://[사용자명].github.io/mathsecr-lecture/` 에서 접속 가능

### 방법 B: Netlify (무료, 가장 쉬움)

1. https://netlify.com 가입
2. Sites → "drag and drop" 영역에 `index.html`과 `review.html`이 있는 폴더를 드래그
3. 자동 배포 완료 → URL 제공됨
4. Site settings에서 도메인 변경 가능 (예: mathsecr.netlify.app)

### 방법 C: 자체 도메인이 있는 경우

- 위 방법 중 하나로 배포 후 커스텀 도메인 연결 가능
- Netlify: Domain settings에서 도메인 추가
- GitHub Pages: CNAME 파일 추가

### 배포 후 해야 할 일

1. 배포된 URL로 다시 한번 전체 테스트
2. Apps Script CONFIG의 `REVIEW_FORM_URL`에 후기 페이지 배포 URL 입력
3. Apps Script **재배포** (배포 → 배포 관리 → 새 버전)

---

## 매주 해야 할 일 (운영 루틴)

| 시점 | 할 일 | 소요 시간 |
|------|------|----------|
| **목요일** | `설정` 시트에서 다음 주 강의 정보 업데이트 (주차, 주제, 설명, 준비물) | 2분 |
| **월요일 강의 후** | 특별히 할 것 없음 (후기 요청은 자동 발송) | 0분 |
| **수요일** | `후기` 시트 확인, 좋은 후기는 랜딩페이지에 반영 | 5분 |

> 트리거가 모든 메일을 자동 발송하므로, 주 1회 설정 시트 업데이트만 하면 됩니다.

---

## 완성 후 자동화 타임라인

```
목요일    : [수동] 설정 시트에 다음 주 강의 정보 입력
금요일 9시 : [자동] 이번 주 강의 미리보기 메일 발송
월요일 9시 : [자동] 오늘 강의 리마인더 메일 발송
월요일 21시: [자동] 1시간 전 최종 알림 + Zoom 링크
월요일 22:30~23:30 : 강의 진행
화요일 0시 : [자동] 후기 작성 요청 메일 발송
수요일 12시: [자동] 미작성자에게만 후기 리마인드 발송
```
