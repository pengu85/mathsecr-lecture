// ═══════════════════════════════════════════════════════════
// 수학비서 월요일 강의 - Google Apps Script 자동화
// ═══════════════════════════════════════════════════════════

// ── 설정 ──
const CONFIG = {
  SPREADSHEET_ID: '', // ← Google Sheets ID를 여기에 입력 (URL의 /d/XXXX/edit 부분)
  SHEET_REGISTER: '신청자',
  SHEET_REVIEW: '후기',
  SHEET_SETTINGS: '설정',

  // 강의 정보
  LECTURE_DAY: '매주 월요일',
  LECTURE_TIME: '밤 10:30 ~ 11:30',

  // Google Calendar 설정 (Meet 링크 자동 생성용)
  CALENDAR_ID: 'primary', // 기본 캘린더 사용. 별도 캘린더 시 ID 입력

  // 발신자 정보
  SENDER_NAME: '수학비서',

  // 후기 폼 URL (배포 후 생성되는 URL + ?mode=review 파라미터)
  REVIEW_FORM_URL: 'https://mathsecr-lecture.vercel.app/review',

  // 솔라피 (알림톡)
  SOLAPI_API_KEY: '',       // ← 솔라피 API Key
  SOLAPI_API_SECRET: '',    // ← 솔라피 API Secret
  SOLAPI_SENDER_PHONE: '',  // ← 발신번호 (솔라피에 등록된 번호)
  SOLAPI_PF_ID: '',         // ← 카카오 비즈니스 채널 ID (pfId)
  SOLAPI_TEMPLATE_ID: '',   // ← 신청완료 알림톡 템플릿 ID
};

// ═══════════════════════════════════════════════════════════
// 1. 웹앱 엔드포인트 (POST 요청 처리)
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // mode에 따라 분기: 신청 vs 후기
    if (data.mode === 'review') {
      return handleReview(data);
    }
    return handleRegistration(data);

  } catch (error) {
    return createJsonResponse({ success: false, message: error.message });
  }
}

// CORS preflight 대응
function doGet(e) {
  return createJsonResponse({ success: true, message: 'API is running' });
}

// ═══════════════════════════════════════════════════════════
// 2. Google Meet 링크 자동 생성
// ═══════════════════════════════════════════════════════════

/**
 * 다음 월요일 강의용 Google Meet 이벤트를 생성하고 Meet 링크를 반환합니다.
 * 금요일 트리거(sendFridayReminder)에서 자동 호출됩니다.
 *
 * @returns {string} Google Meet 링크
 */
function createWeeklyMeetEvent() {
  const settings = getSettings();
  const weekTopic = settings.thisWeekTopic || '수학비서 AI 활용법 강의';
  const weekNum = settings.currentWeek || '1';

  // 다음 월요일 날짜 계산
  const nextMonday = getNextMonday();
  const startTime = new Date(nextMonday);
  startTime.setHours(22, 30, 0, 0); // 22:30
  const endTime = new Date(nextMonday);
  endTime.setHours(23, 30, 0, 0);   // 23:30

  // Calendar Advanced Service로 Meet 링크 포함 이벤트 생성
  const event = {
    summary: `[수학비서] WEEK ${weekNum}: ${weekTopic}`,
    description: `수학비서 AI 활용법 강의 ${weekNum}주차\n\n주제: ${weekTopic}\n\n${settings.thisWeekDescription || ''}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'Asia/Seoul',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'Asia/Seoul',
    },
    conferenceData: {
      createRequest: {
        requestId: `mathsecr-week${weekNum}-${Date.now()}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
    // 신청자들에게 캘린더 초대 보내지 않음 (메일로 별도 안내)
    guestsCanModify: false,
  };

  const calendarEvent = Calendar.Events.insert(
    event,
    CONFIG.CALENDAR_ID,
    { conferenceDataVersion: 1 }
  );

  const meetLink = calendarEvent.conferenceData.entryPoints
    .find(ep => ep.entryPointType === 'video').uri;

  // 설정 시트에 이번 주 Meet 링크 저장
  saveMeetLink(meetLink, calendarEvent.id);

  Logger.log(`Meet 링크 생성 완료: ${meetLink}`);
  return meetLink;
}

/**
 * 이번 주 Meet 링크를 설정 시트에 저장
 */
function saveMeetLink(meetLink, eventId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
  const data = sheet.getDataRange().getValues();

  let meetLinkRow = -1;
  let eventIdRow = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'meetLink') meetLinkRow = i + 1;
    if (data[i][0] === 'meetEventId') eventIdRow = i + 1;
  }

  // meetLink 행이 없으면 추가, 있으면 업데이트
  if (meetLinkRow === -1) {
    sheet.appendRow(['meetLink', meetLink]);
  } else {
    sheet.getRange(meetLinkRow, 2).setValue(meetLink);
  }

  if (eventIdRow === -1) {
    sheet.appendRow(['meetEventId', eventId]);
  } else {
    sheet.getRange(eventIdRow, 2).setValue(eventId);
  }
}

/**
 * 설정 시트에서 이번 주 Meet 링크 가져오기
 * 없으면 새로 생성
 */
function getThisWeekMeetLink() {
  const settings = getSettings();
  if (settings.meetLink) {
    return settings.meetLink;
  }
  // 링크가 없으면 새로 생성
  return createWeeklyMeetEvent();
}

/**
 * 다음 월요일 날짜 반환
 */
function getNextMonday() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 6=토
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

/**
 * 신청자를 기존 캘린더 이벤트에 게스트로 추가 (선택)
 */
function addGuestToMeetEvent(email) {
  const settings = getSettings();
  if (!settings.meetEventId) return;

  try {
    const event = Calendar.Events.get(CONFIG.CALENDAR_ID, settings.meetEventId);
    const attendees = event.attendees || [];

    // 이미 추가된 이메일인지 체크
    if (attendees.some(a => a.email === email)) return;

    attendees.push({ email: email });
    event.attendees = attendees;

    Calendar.Events.update(event, CONFIG.CALENDAR_ID, settings.meetEventId, {
      sendUpdates: 'none', // 캘린더 초대 메일 보내지 않음 (우리 메일로 안내)
    });
  } catch (e) {
    Logger.log(`캘린더 게스트 추가 실패: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// 3. 신청 처리
// ═══════════════════════════════════════════════════════════

function handleRegistration(data) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);

  // 중복 체크 (이메일 기준)
  const existingEmails = sheet.getRange('D2:D' + sheet.getLastRow()).getValues().flat();
  if (existingEmails.includes(data.email)) {
    return createJsonResponse({ success: false, message: '이미 신청하신 이메일입니다.' });
  }

  // 설문 응답 직렬화
  const survey = data.survey || {};
  const surveyStr = Object.entries(survey).map(([k, v]) => k + ':' + (v || '-')).join('|');

  // 시트에 기록
  const now = new Date();
  sheet.appendRow([
    now,                              // A: 신청일시
    data.name,                        // B: 이름
    data.phone,                       // C: 연락처
    data.email,                       // D: 이메일
    data.role,                        // E: 직책
    data.experience || '',            // F: 경력
    data.academy || '',               // G: 학원명
    data.interest || '',              // H: 관심주제
    data.challenge || '',             // I: 어려운점
    data.marketing ? 'Y' : 'N',      // J: 마케팅동의
    '신청완료',                        // K: 상태
    '',                               // L: 후기작성여부
    data.eduTarget || '',             // M: 교육대상
    data.region || '',                // N: 활동지역
    surveyStr,                        // O: 인식도설문(O/X)
    data.surveyExpectation || '',     // P: 기대서비스
    data.surveyDifferentiator || '',  // Q: 차별점
    data.surveyDbExpectation || '',   // R: DB화 기대
  ]);

  // 이번 주 Meet 링크 가져오기
  const meetLink = getThisWeekMeetLink();

  // 확인 메일 발송 (Meet 링크 포함)
  sendConfirmationEmail(data, meetLink);

  // 캘린더 이벤트에 게스트 추가 (선택)
  addGuestToMeetEvent(data.email);

  // 솔라피 알림톡 발송
  sendRegistrationAlimtalk(data, meetLink);

  return createJsonResponse({ success: true, message: '신청이 완료되었습니다.' });
}

// ═══════════════════════════════════════════════════════════
// 3. 이메일 템플릿
// ═══════════════════════════════════════════════════════════

function sendConfirmationEmail(data, meetLink) {
  const subject = '[수학비서] AI 활용법 강의 신청이 완료되었습니다!';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:22px;margin:0;">수학비서 AI 활용법 강의</h1>
        <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">신청이 완료되었습니다!</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:16px;color:#111827;margin:0 0 20px;">
          <strong>${data.name}</strong>님, 환영합니다! 🎉
        </p>
        <div style="background:#F3F4F6;border-radius:12px;padding:20px;margin:0 0 20px;">
          <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">📅 일시</p>
          <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:600;">${CONFIG.LECTURE_DAY} 밤 10:30 ~ 11:30</p>
          <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">💻 참여 방법</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">Google Meet 온라인 (아래 링크 클릭)</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${meetLink}" style="display:inline-block;background:#1A73E8;color:#fff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">
            Google Meet 입장 링크
          </a>
        </div>
        <p style="text-align:center;font-size:13px;color:#6B7280;margin:0 0 20px;">
          ${meetLink}
        </p>
        <div style="border-top:1px solid #E5E7EB;padding-top:20px;margin-top:20px;">
          <p style="font-size:14px;color:#6B7280;margin:0 0 8px;font-weight:600;">📌 참고 사항</p>
          <ul style="font-size:13px;color:#6B7280;margin:0;padding-left:20px;line-height:2;">
            <li>노트북 또는 데스크톱을 준비해주세요</li>
            <li>강의 시작 10분 전 입장을 권장합니다</li>
            <li>녹화본은 강의 다음 날 메일로 보내드립니다</li>
            <li>매주 새로운 Meet 링크가 발급됩니다</li>
            <li>문의: mathsecr@example.com</li>
          </ul>
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:#9CA3AF;margin-top:16px;">
        수학비서 | 수학 강사님의 든든한 AI 비서
      </p>
    </div>
  `;

  GmailApp.sendEmail(data.email, subject, '', {
    htmlBody: htmlBody,
    name: CONFIG.SENDER_NAME,
  });
}

// ═══════════════════════════════════════════════════════════
// 4. 리마인더 (트리거로 자동 실행)
// ═══════════════════════════════════════════════════════════

/**
 * 금요일 오전 - 이번 주 강의 미리보기
 * 트리거: 매주 금요일 09:00
 */
function sendFridayReminder() {
  // 매주 금요일에 새 Google Meet 링크를 자동 생성
  const meetLink = createWeeklyMeetEvent();

  const recipients = getActiveRecipients();
  const settings = getSettings();
  const weekTopic = settings.thisWeekTopic || '이번 주 강의';
  const weekNum = settings.currentWeek || '1';

  const subject = `[수학비서] 이번 주 월요일 강의: ${weekTopic}`;

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);padding:28px;border-radius:16px 16px 0 0;text-align:center;">
        <p style="color:rgba(255,255,255,0.7);margin:0;font-size:13px;">WEEK ${weekNum}</p>
        <h1 style="color:#fff;font-size:20px;margin:8px 0 0;">${weekTopic}</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 20px;">
          안녕하세요! 이번 주 월요일 밤 강의 주제를 미리 알려드립니다. 🎓
        </p>
        <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#92400E;line-height:1.6;">
            ${settings.thisWeekDescription || '강의 내용을 확인해주세요.'}
          </p>
        </div>
        <div style="background:#F3F4F6;border-radius:12px;padding:16px;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#374151;">
            📅 <strong>월요일 밤 10:30</strong> | 💻 <strong>Google Meet</strong>
          </p>
        </div>
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${meetLink}" style="display:inline-block;background:#1A73E8;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">
            Google Meet 입장 링크
          </a>
          <p style="font-size:12px;color:#9CA3AF;margin:8px 0 0;">${meetLink}</p>
        </div>
        ${settings.preparation ? `
        <p style="font-size:14px;color:#6B7280;margin:0;">
          <strong>📌 준비물:</strong> ${settings.preparation}
        </p>
        ` : ''}
      </div>
    </div>
  `;

  recipients.forEach(r => {
    try {
      GmailApp.sendEmail(r.email, subject, '', {
        htmlBody: htmlBody.replace('안녕하세요!', `${r.name}님, 안녕하세요!`),
        name: CONFIG.SENDER_NAME,
      });
      Utilities.sleep(100); // Gmail 속도 제한 방지
    } catch (e) {
      Logger.log(`메일 발송 실패: ${r.email} - ${e.message}`);
    }
  });

  Logger.log(`금요일 리마인더 발송 완료: ${recipients.length}명`);
}

/**
 * 월요일 오전 - 당일 알림
 * 트리거: 매주 월요일 09:00
 */
function sendMondayMorningReminder() {
  const meetLink = getThisWeekMeetLink();
  const recipients = getActiveRecipients();

  const subject = '[수학비서] 오늘 밤 10:30 AI 활용법 강의가 있습니다!';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:#2563EB;padding:24px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;">⏰ 오늘 밤 10:30 강의!</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 20px;">
          오늘 밤 수학비서 AI 활용법 강의가 있습니다.<br>잊지 마시고 참여해주세요!
        </p>
        <div style="text-align:center;margin:20px 0;">
          <a href="${meetLink}" style="display:inline-block;background:#1A73E8;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">
            Google Meet 입장하기
          </a>
          <p style="font-size:12px;color:#9CA3AF;margin:8px 0 0;">${meetLink}</p>
        </div>
        <p style="text-align:center;font-size:13px;color:#9CA3AF;margin:16px 0 0;">
          시작 10분 전 입장을 권장합니다
        </p>
      </div>
    </div>
  `;

  recipients.forEach(r => {
    try {
      GmailApp.sendEmail(r.email, subject, '', {
        htmlBody: htmlBody,
        name: CONFIG.SENDER_NAME,
      });
      Utilities.sleep(100);
    } catch (e) {
      Logger.log(`메일 발송 실패: ${r.email} - ${e.message}`);
    }
  });

  Logger.log(`월요일 오전 리마인더 발송 완료: ${recipients.length}명`);
}

/**
 * 월요일 밤 9시 - 1시간 전 최종 알림
 * 트리거: 매주 월요일 21:00
 */
function sendMondayFinalReminder() {
  const meetLink = getThisWeekMeetLink();
  const recipients = getActiveRecipients();

  const subject = '[수학비서] 1시간 후 강의 시작! Meet 링크 안내';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:#DC2626;padding:20px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;">🔔 1시간 후 시작!</h1>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
        <p style="font-size:28px;margin:0 0 8px;">22:30</p>
        <p style="font-size:14px;color:#6B7280;margin:0 0 20px;">밤 10시 30분 시작</p>
        <a href="${meetLink}" style="display:inline-block;background:#1A73E8;color:#fff;padding:16px 48px;border-radius:12px;text-decoration:none;font-size:17px;font-weight:700;">
          지금 Google Meet 입장하기
        </a>
        <p style="font-size:12px;color:#9CA3AF;margin:12px 0 0;">${meetLink}</p>
      </div>
    </div>
  `;

  recipients.forEach(r => {
    try {
      GmailApp.sendEmail(r.email, subject, '', {
        htmlBody: htmlBody,
        name: CONFIG.SENDER_NAME,
      });
      Utilities.sleep(100);
    } catch (e) {
      Logger.log(`메일 발송 실패: ${r.email} - ${e.message}`);
    }
  });

  Logger.log(`월요일 최종 리마인더 발송 완료: ${recipients.length}명`);
}

// ═══════════════════════════════════════════════════════════
// 5. 후기 수집 자동화
// ═══════════════════════════════════════════════════════════

/**
 * 강의 다음 날 자정 - 후기 요청
 * 트리거: 매주 화요일 00:00
 */
function sendReviewRequest() {
  const recipients = getActiveRecipients();

  const subject = '[수학비서] 어제 강의 어떠셨나요? 30초 후기를 남겨주세요!';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:linear-gradient(135deg,#7C3AED,#A855F7);padding:28px;border-radius:16px 16px 0 0;text-align:center;">
        <p style="font-size:40px;margin:0 0 8px;">✍️</p>
        <h1 style="color:#fff;font-size:20px;margin:0;">강의 후기를 남겨주세요!</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 20px;">
          어제 강의에 참여해주셔서 감사합니다!<br>
          <strong>30초면 되는 간단한 후기</strong>를 남겨주시면<br>
          더 좋은 강의를 준비하는 데 큰 도움이 됩니다.
        </p>
        <div style="background:#FEF3C7;border-radius:12px;padding:16px;margin:0 0 24px;text-align:center;">
          <p style="margin:0;font-size:14px;color:#92400E;font-weight:600;">
            🎁 후기 작성 시 다음 강의 실습 자료를 미리 보내드려요!
          </p>
        </div>
        <div style="text-align:center;">
          <a href="${CONFIG.REVIEW_FORM_URL}" style="display:inline-block;background:#7C3AED;color:#fff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">
            30초 후기 남기기
          </a>
        </div>
      </div>
    </div>
  `;

  recipients.forEach(r => {
    try {
      GmailApp.sendEmail(r.email, subject, '', {
        htmlBody: htmlBody,
        name: CONFIG.SENDER_NAME,
      });
      Utilities.sleep(100);
    } catch (e) {
      Logger.log(`메일 발송 실패: ${r.email} - ${e.message}`);
    }
  });

  Logger.log(`후기 요청 발송 완료: ${recipients.length}명`);
}

/**
 * 수요일 점심 - 미작성자에게 리마인드
 * 트리거: 매주 수요일 12:00
 */
function sendReviewReminder() {
  const ss = getSpreadsheet();
  const registerSheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);
  const reviewSheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);

  // 후기 작성자 이메일 목록 (이번 주 것만)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const reviewData = reviewSheet.getDataRange().getValues();
  const reviewedEmails = reviewData
    .filter(row => row[0] && new Date(row[0]) > oneWeekAgo)
    .map(row => row[2]); // C열: 이메일

  // 신청자 중 후기 미작성자 필터링
  const allRecipients = getActiveRecipients();
  const nonReviewers = allRecipients.filter(r => !reviewedEmails.includes(r.email));

  if (nonReviewers.length === 0) {
    Logger.log('모든 참가자가 후기를 작성했습니다.');
    return;
  }

  const subject = '[수학비서] 아직 후기를 안 남기셨네요! 실습 자료가 기다리고 있어요 🎁';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-radius:16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 16px;">
          월요일 강의는 유익하셨나요?<br>
          아직 후기를 남기지 않으셨네요!
        </p>
        <p style="font-size:14px;color:#6B7280;margin:0 0 20px;">
          별점과 한 줄만 남겨주시면, <strong>다음 강의 실습 자료</strong>를 미리 보내드립니다.
        </p>
        <div style="text-align:center;">
          <a href="${CONFIG.REVIEW_FORM_URL}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">
            후기 남기기 (30초)
          </a>
        </div>
      </div>
    </div>
  `;

  nonReviewers.forEach(r => {
    try {
      GmailApp.sendEmail(r.email, subject, '', {
        htmlBody: htmlBody,
        name: CONFIG.SENDER_NAME,
      });
      Utilities.sleep(100);
    } catch (e) {
      Logger.log(`메일 발송 실패: ${r.email} - ${e.message}`);
    }
  });

  Logger.log(`후기 리마인더 발송 완료: ${nonReviewers.length}명 (미작성자)`);
}

// ═══════════════════════════════════════════════════════════
// 6. 후기 접수 처리
// ═══════════════════════════════════════════════════════════

function handleReview(data) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);

  const now = new Date();
  sheet.appendRow([
    now,                   // A: 작성일시
    data.name,             // B: 이름
    data.email,            // C: 이메일
    data.rating,           // D: 별점 (1~5)
    data.comment,          // E: 한줄평
    data.bestPart || '',   // F: 가장 좋았던 점
    data.improvement || '',// G: 개선 희망사항
    data.recommend || '',  // H: 추천 의향 (1~10)
  ]);

  // 신청자 시트에 후기 작성 표시
  const registerSheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);
  const registerData = registerSheet.getDataRange().getValues();
  for (let i = 1; i < registerData.length; i++) {
    if (registerData[i][3] === data.email) { // D열: 이메일
      registerSheet.getRange(i + 1, 12).setValue('Y'); // L열: 후기작성여부
      break;
    }
  }

  // 감사 메일 발송
  sendReviewThankYouEmail(data);

  return createJsonResponse({ success: true, message: '후기가 등록되었습니다.' });
}

function sendReviewThankYouEmail(data) {
  const subject = '[수학비서] 소중한 후기 감사합니다! 🎁 실습 자료를 보내드립니다';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:linear-gradient(135deg,#059669,#10B981);padding:24px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;">감사합니다! 🎉</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 16px;">
          <strong>${data.name}</strong>님, 후기를 남겨주셔서 감사합니다!<br>
          약속드린 대로 다음 강의 실습 자료를 미리 공유드립니다.
        </p>
        <div style="background:#ECFDF5;border-radius:12px;padding:16px;margin:0 0 16px;">
          <p style="margin:0;font-size:14px;color:#065F46;">
            📎 다음 주 강의 실습 자료는 금요일 리마인더 메일과 함께 발송됩니다.
          </p>
        </div>
        <p style="font-size:13px;color:#9CA3AF;margin:0;">
          더 좋은 강의로 보답하겠습니다. 다음 월요일에 만나요!
        </p>
      </div>
    </div>
  `;

  GmailApp.sendEmail(data.email, subject, '', {
    htmlBody: htmlBody,
    name: CONFIG.SENDER_NAME,
  });
}

// ═══════════════════════════════════════════════════════════
// 7. 유틸리티 함수
// ═══════════════════════════════════════════════════════════

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * '신청완료' 상태인 참가자 목록 반환
 */
function getActiveRecipients() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);
  const data = sheet.getDataRange().getValues();

  const recipients = [];
  for (let i = 1; i < data.length; i++) {
    const status = data[i][10]; // K열: 상태
    if (status === '신청완료' || status === '참여중') {
      recipients.push({
        name: data[i][1],    // B열
        phone: data[i][2],   // C열
        email: data[i][3],   // D열
      });
    }
  }
  return recipients;
}

/**
 * 설정 시트에서 이번 주 강의 정보 가져오기
 */
function getSettings() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);

  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const settings = {};

  // 설정 시트 형식: A열 = 키, B열 = 값
  data.forEach(row => {
    if (row[0]) {
      settings[row[0]] = row[1];
    }
  });

  return settings;
}

/**
 * JSON 응답 생성 (CORS 대응 포함)
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// 8. 관리용 함수
// ═══════════════════════════════════════════════════════════

/**
 * 스프레드시트 초기 세팅 (최초 1회 실행)
 */
function initializeSheets() {
  const ss = getSpreadsheet();

  // 신청자 시트 헤더
  let sheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_REGISTER);
  }
  sheet.getRange(1, 1, 1, 12).setValues([[
    '신청일시', '이름', '연락처', '이메일', '직책',
    '경력', '학원명', '관심주제', '어려운점', '마케팅동의',
    '상태', '후기작성'
  ]]);
  sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // 후기 시트 헤더
  let reviewSheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);
  if (!reviewSheet) {
    reviewSheet = ss.insertSheet(CONFIG.SHEET_REVIEW);
  }
  reviewSheet.getRange(1, 1, 1, 8).setValues([[
    '작성일시', '이름', '이메일', '별점', '한줄평',
    '좋았던점', '개선희망', '추천의향'
  ]]);
  reviewSheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  reviewSheet.setFrozenRows(1);

  // 설정 시트
  let settingsSheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(CONFIG.SHEET_SETTINGS);
  }
  settingsSheet.getRange(1, 1, 7, 2).setValues([
    ['키', '값'],
    ['currentWeek', '1'],
    ['thisWeekTopic', '클로드코드 기본 세팅'],
    ['thisWeekDescription', '클로드코드 설치부터 MCP 연결, 클로드 스킬 세팅까지 한 번에 끝내는 시간입니다.'],
    ['preparation', '노트북 또는 데스크톱'],
    ['meetLink', ''],       // 금요일 트리거가 자동으로 채움
    ['meetEventId', ''],    // 금요일 트리거가 자동으로 채움
  ]);
  settingsSheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  settingsSheet.setFrozenRows(1);

  Logger.log('시트 초기 설정 완료');
}

/**
 * 통계 대시보드 (수동 실행용)
 */
function logStats() {
  const ss = getSpreadsheet();
  const registerSheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);
  const reviewSheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);

  const registerData = registerSheet.getDataRange().getValues();
  const reviewData = reviewSheet.getDataRange().getValues();

  const totalRegistered = registerData.length - 1;
  const totalReviews = reviewData.length - 1;

  const avgRating = totalReviews > 0
    ? (reviewData.slice(1).reduce((sum, row) => sum + Number(row[3]), 0) / totalReviews).toFixed(1)
    : 0;

  Logger.log(`=== 수학비서 강의 통계 ===`);
  Logger.log(`총 신청자: ${totalRegistered}명`);
  Logger.log(`총 후기: ${totalReviews}건`);
  Logger.log(`후기 작성률: ${totalRegistered > 0 ? ((totalReviews / totalRegistered) * 100).toFixed(1) : 0}%`);
  Logger.log(`평균 별점: ${avgRating}/5`);
}

// ═══════════════════════════════════════════════════════════
// 9. 솔라피 알림톡 연동
// ═══════════════════════════════════════════════════════════
//
// [사전 준비]
// 1. https://console.solapi.com 가입 & 발신번호 등록
// 2. 카카오 비즈니스 채널 연동 → pfId 획득
// 3. 알림톡 템플릿 등록 (아래 내용으로 검수 신청)
// 4. CONFIG에 API Key, Secret, 발신번호, pfId, 템플릿ID 입력
//
// [등록할 템플릿 내용] (솔라피 콘솔에 아래 내용 복사)
// ────────────────────────────────────
// 템플릿명: 수학비서_강의신청완료
// 카테고리: 알림
// 내용:
//   #{name}님, 수학비서 AI 활용법 강의 신청이 완료되었습니다!
//
//   📅 일시: 매주 월요일 밤 10:30 ~ 11:30
//   💻 방식: Google Meet 온라인
//   🔗 입장: #{meetLink}
//
//   🎁 신청 선물은 이메일로 발송해드렸습니다.
//   확인 메일도 함께 보내드렸으니 확인해주세요!
//
//   ※ 매주 새로운 Meet 링크가 발급됩니다.
//   ※ 문의: mathsecr@example.com
// ────────────────────────────────────

/**
 * 솔라피 HMAC-SHA256 인증 헤더 생성
 */
function createSolapiAuthHeader() {
  const date = new Date().toISOString();
  const salt = Utilities.getUuid();
  const signatureBytes = Utilities.computeHmacSha256Signature(
    date + salt,
    CONFIG.SOLAPI_API_SECRET
  );
  const signature = signatureBytes
    .map(b => ('0' + ((b < 0 ? b + 256 : b).toString(16))).slice(-2))
    .join('');

  return `HMAC-SHA256 apiKey=${CONFIG.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * 신청 완료 알림톡 발송
 * 알림톡 실패 시 LMS(장문 문자)로 대체 발송
 */
function sendRegistrationAlimtalk(data, meetLink) {
  if (!CONFIG.SOLAPI_API_KEY || !CONFIG.SOLAPI_API_SECRET) {
    Logger.log('솔라피 API 키 미설정 - 알림톡 건너뜀');
    return;
  }

  const phone = data.phone.replace(/-/g, '');
  const from = CONFIG.SOLAPI_SENDER_PHONE.replace(/-/g, '');

  // 알림톡 메시지 구성
  const message = {
    to: phone,
    from: from,
  };

  // 템플릿 ID가 있으면 알림톡, 없으면 LMS 발송
  if (CONFIG.SOLAPI_PF_ID && CONFIG.SOLAPI_TEMPLATE_ID) {
    // 알림톡 (카카오톡)
    message.kakaoOptions = {
      pfId: CONFIG.SOLAPI_PF_ID,
      templateId: CONFIG.SOLAPI_TEMPLATE_ID,
      variables: {
        '#{name}': data.name,
        '#{meetLink}': meetLink || '(강의 전 별도 안내)',
      },
    };
    // 알림톡 실패 시 LMS 대체 발송
    message.type = 'ATA'; // 알림톡
    message.subject = '[수학비서] 강의 신청 완료';
    message.text = buildSmsText(data.name, meetLink);
  } else {
    // 템플릿 미등록 시 LMS로 발송
    message.type = 'LMS';
    message.subject = '[수학비서] 강의 신청 완료';
    message.text = buildSmsText(data.name, meetLink);
  }

  const url = 'https://api.solapi.com/messages/v4/send';
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': createSolapiAuthHeader(),
    },
    payload: JSON.stringify({ message: message }),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    if (result.statusCode && result.statusCode !== '2000') {
      Logger.log(`알림톡 발송 실패 (${result.statusCode}): ${result.statusMessage || JSON.stringify(result)}`);
    } else {
      Logger.log(`알림톡 발송 성공: ${phone}`);
    }
  } catch (e) {
    Logger.log(`알림톡 발송 오류: ${e.message}`);
  }
}

/**
 * LMS 대체 발송용 텍스트 생성
 */
function buildSmsText(name, meetLink) {
  return [
    `${name}님, 수학비서 AI 활용법 강의 신청이 완료되었습니다!`,
    '',
    '📅 매주 월요일 밤 10:30 ~ 11:30',
    '💻 Google Meet 온라인',
    meetLink ? `🔗 ${meetLink}` : '',
    '',
    '🎁 신청 선물은 이메일로 발송해드렸습니다.',
    '',
    '※ 매주 새로운 Meet 링크가 발급됩니다.',
    '※ 문의: mathsecr@example.com',
  ].filter(Boolean).join('\n');
}
