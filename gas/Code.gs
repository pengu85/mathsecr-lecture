// ═══════════════════════════════════════════════════════════
// 수학비서 월요일 강의 - Google Apps Script 자동화
// ═══════════════════════════════════════════════════════════

// ── 설정 ──
const CONFIG = {
  SPREADSHEET_ID: '1dr-MQKCZXcGdqks5j1zls7g_RSkjmhd_yVyF-jOpUwI',
  SHEET_REGISTER: '신청자',
  SHEET_REVIEW: '후기',
  SHEET_SETTINGS: '설정',

  // 강의 정보
  LECTURE_DAY: '매주 월요일',
  LECTURE_TIME: '밤 11:00 ~ 12:00',

  // 유튜브 라이브
  YOUTUBE_LIVE_URL: '', // ← 유튜브 라이브 링크 (매주 업데이트하거나, 설정 시트에서 관리)

  // 발신자 정보
  SENDER_NAME: '수학비서',

  // 후기 폼 URL
  REVIEW_FORM_URL: 'https://mathsecr-lecture.vercel.app/review',

  // 솔라피 (알림톡/문자)
  SOLAPI_API_KEY: 'NCS5PM0NKWQAKNJQ',
  SOLAPI_API_SECRET: 'RUHZH8VNXMREC0JK0JKEUFN4P783W0WQ',
  SOLAPI_SENDER_PHONE: '01083950234',
  SOLAPI_PF_ID: '',         // ← 카카오 비즈니스 채널 ID (알림톡 사용 시)
  SOLAPI_TEMPLATE_ID: '',   // ← 알림톡 템플릿 ID (비워두면 LMS 문자로 발송)
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

// CORS preflight 대응 + API 라우팅
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'stats') {
    return handleGetStats();
  }
  if (action === 'reviews') {
    return handleGetReviews();
  }

  return createJsonResponse({ success: true, message: 'API is running' });
}

/**
 * 관리자 대시보드용 통계 반환
 */
function handleGetStats() {
  const ss = getSpreadsheet();
  const registerSheet = ss.getSheetByName(CONFIG.SHEET_REGISTER);
  const reviewSheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);

  const registerData = registerSheet.getDataRange().getValues();
  const reviewData = reviewSheet.getDataRange().getValues();

  const totalRegistered = Math.max(0, registerData.length - 1);
  const totalReviews = Math.max(0, reviewData.length - 1);

  // 평균 별점
  const avgRating = totalReviews > 0
    ? (reviewData.slice(1).reduce((sum, row) => sum + Number(row[3]), 0) / totalReviews).toFixed(1)
    : '0';

  // NPS 계산 (추천의향 0-10)
  const npsScores = reviewData.slice(1).map(row => Number(row[7])).filter(n => !isNaN(n) && n >= 0);
  let nps = 0;
  if (npsScores.length > 0) {
    const promoters = npsScores.filter(s => s >= 9).length;
    const detractors = npsScores.filter(s => s <= 6).length;
    nps = Math.round(((promoters - detractors) / npsScores.length) * 100);
  }

  // 후기 작성률
  const reviewRate = totalRegistered > 0
    ? Math.round((totalReviews / totalRegistered) * 100)
    : 0;

  // 직책별 분포
  const roles = {};
  registerData.slice(1).forEach(row => {
    const role = row[4] || '미입력';
    roles[role] = (roles[role] || 0) + 1;
  });

  // 최근 7일 신청자 수
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const recentRegistrations = registerData.slice(1)
    .filter(row => row[0] && new Date(row[0]) > oneWeekAgo).length;

  // 최근 후기 5개
  const recentReviews = reviewData.slice(1).slice(-5).reverse().map(row => ({
    date: row[0] ? new Date(row[0]).toLocaleDateString('ko-KR') : '',
    name: row[1],
    rating: Number(row[3]),
    comment: row[4],
  }));

  return createJsonResponse({
    success: true,
    data: {
      totalRegistered,
      totalReviews,
      avgRating: Number(avgRating),
      nps,
      reviewRate,
      recentRegistrations,
      roles,
      recentReviews,
    }
  });
}

/**
 * 랜딩페이지용 - 별점 4점 이상 후기 반환
 */
function handleGetReviews() {
  const ss = getSpreadsheet();
  const reviewSheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);
  const data = reviewSheet.getDataRange().getValues();

  const goodReviews = data.slice(1)
    .filter(row => Number(row[3]) >= 4 && row[4])
    .map(row => ({
      name: row[1],
      rating: Number(row[3]),
      comment: row[4],
    }))
    .slice(-6)
    .reverse();

  return createJsonResponse({ success: true, data: goodReviews });
}

// ═══════════════════════════════════════════════════════════
// 2. 유튜브 라이브 링크 관리
// ═══════════════════════════════════════════════════════════

/**
 * 유튜브 라이브 링크 가져오기
 * 설정 시트의 liveLink 값 우선, 없으면 CONFIG.YOUTUBE_LIVE_URL 사용
 */
function getLiveLink() {
  const settings = getSettings();
  return settings.liveLink || CONFIG.YOUTUBE_LIVE_URL || '';
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

  // 유튜브 라이브 링크 가져오기 (설정 시트 우선, 없으면 CONFIG)
  const liveLink = getLiveLink();

  // 확인 메일 발송
  sendConfirmationEmail(data, liveLink);

  // 솔라피 알림톡 발송
  sendRegistrationAlimtalk(data, liveLink);

  return createJsonResponse({ success: true, message: '신청이 완료되었습니다.' });
}

// ═══════════════════════════════════════════════════════════
// 3. 이메일 템플릿
// ═══════════════════════════════════════════════════════════

function sendConfirmationEmail(data, liveLink) {
  const subject = '[수학비서] AI 활용법 강의 신청이 완료되었습니다!';

  const liveLinkHtml = liveLink
    ? `<div style="text-align:center;margin:24px 0;">
          <a href="${liveLink}" style="display:inline-block;background:#FF0000;color:#fff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">
            ▶ 유튜브 라이브 입장하기
          </a>
        </div>
        <p style="text-align:center;font-size:13px;color:#6B7280;margin:0 0 20px;">
          ${liveLink}
        </p>`
    : `<p style="text-align:center;font-size:14px;color:#6B7280;margin:20px 0;">
          라이브 링크는 강의 당일 별도 안내드립니다.
        </p>`;

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:22px;margin:0;">수학비서 AI 활용법 강의</h1>
        <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">신청이 완료되었습니다!</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:16px;color:#111827;margin:0 0 20px;">
          <strong>${data.name}</strong>님, 환영합니다!
        </p>
        <div style="background:#F3F4F6;border-radius:12px;padding:20px;margin:0 0 20px;">
          <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">📅 일시</p>
          <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:600;">${CONFIG.LECTURE_DAY} ${CONFIG.LECTURE_TIME}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">📺 참여 방법</p>
          <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">유튜브 라이브 (완전 무료)</p>
        </div>
        ${liveLinkHtml}
        <div style="border-top:1px solid #E5E7EB;padding-top:20px;margin-top:20px;">
          <p style="font-size:14px;color:#6B7280;margin:0 0 8px;font-weight:600;">📌 참고 사항</p>
          <ul style="font-size:13px;color:#6B7280;margin:0;padding-left:20px;line-height:2;">
            <li>스마트폰, 태블릿, PC 어디서든 시청 가능합니다</li>
            <li>유튜브 채팅으로 실시간 질의응답이 가능합니다</li>
            <li>녹화본은 강의 다음 날 메일로 보내드립니다</li>
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
  const liveLink = getLiveLink();
  const recipients = getActiveRecipients();
  const settings = getSettings();
  const weekTopic = settings.thisWeekTopic || '이번 주 강의';
  const weekNum = settings.currentWeek || '1';

  const subject = `[수학비서] 이번 주 월요일 강의: ${weekTopic}`;

  const liveLinkHtml = liveLink
    ? `<div style="text-align:center;margin:0 0 20px;">
          <a href="${liveLink}" style="display:inline-block;background:#FF0000;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">
            ▶ 유튜브 라이브 입장
          </a>
        </div>`
    : '<p style="text-align:center;font-size:14px;color:#6B7280;margin:0 0 20px;">라이브 링크는 월요일 당일 안내드립니다.</p>';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);padding:28px;border-radius:16px 16px 0 0;text-align:center;">
        <p style="color:rgba(255,255,255,0.7);margin:0;font-size:13px;">WEEK ${weekNum}</p>
        <h1 style="color:#fff;font-size:20px;margin:8px 0 0;">${weekTopic}</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 20px;">
          안녕하세요! 이번 주 월요일 밤 강의 주제를 미리 알려드립니다.
        </p>
        <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#92400E;line-height:1.6;">
            ${settings.thisWeekDescription || '강의 내용을 확인해주세요.'}
          </p>
        </div>
        <div style="background:#F3F4F6;border-radius:12px;padding:16px;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#374151;">
            📅 <strong>월요일 ${CONFIG.LECTURE_TIME}</strong> | 📺 <strong>유튜브 라이브</strong>
          </p>
        </div>
        ${liveLinkHtml}
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
      Utilities.sleep(100);
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
  const liveLink = getLiveLink();
  const recipients = getActiveRecipients();

  const subject = '[수학비서] 오늘 밤 11시 AI 활용법 강의가 있습니다!';

  const liveLinkHtml = liveLink
    ? `<div style="text-align:center;margin:20px 0;">
          <a href="${liveLink}" style="display:inline-block;background:#FF0000;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">
            ▶ 유튜브 라이브 입장하기
          </a>
        </div>`
    : '<p style="text-align:center;font-size:14px;color:#6B7280;margin:20px 0;">라이브 링크는 강의 시작 전 별도 안내드립니다.</p>';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:#2563EB;padding:24px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;">오늘 밤 11시 강의!</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;">
        <p style="font-size:15px;color:#111827;line-height:1.7;margin:0 0 20px;">
          오늘 밤 수학비서 AI 활용법 강의가 있습니다.<br>유튜브 라이브로 편하게 참여해주세요!
        </p>
        ${liveLinkHtml}
        <p style="text-align:center;font-size:13px;color:#9CA3AF;margin:16px 0 0;">
          스마트폰, 태블릿, PC 어디서든 시청 가능합니다
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
/**
 * 월요일 밤 10시 - 1시간 전 최종 알림
 * 트리거: 매주 월요일 22:00
 */
function sendMondayFinalReminder() {
  const liveLink = getLiveLink();
  const recipients = getActiveRecipients();

  const subject = '[수학비서] 1시간 후 강의 시작! 유튜브 라이브 링크 안내';

  const liveLinkHtml = liveLink
    ? `<a href="${liveLink}" style="display:inline-block;background:#FF0000;color:#fff;padding:16px 48px;border-radius:12px;text-decoration:none;font-size:17px;font-weight:700;">
          ▶ 지금 유튜브 라이브 입장하기
        </a>`
    : '<p style="font-size:14px;color:#6B7280;">라이브 링크는 곧 안내드립니다.</p>';

  const htmlBody = `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <div style="background:#DC2626;padding:20px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;">1시간 후 시작!</h1>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
        <p style="font-size:28px;margin:0 0 8px;">23:00</p>
        <p style="font-size:14px;color:#6B7280;margin:0 0 20px;">밤 11시 시작</p>
        ${liveLinkHtml}
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
  const ss = getSpreadsheet();
  const reviewSheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const reviewData = reviewSheet.getDataRange().getValues();
  const reviewedEmails = reviewData
    .filter(row => row[0] && new Date(row[0]) > oneWeekAgo)
    .map(row => row[2]); // C열: 이메일

  const allRecipients = getActiveRecipients();
  const recipients = allRecipients.filter(r => !reviewedEmails.includes(r.email));

  if (recipients.length === 0) {
    Logger.log('모든 참가자가 이미 후기를 작성했습니다.');
    return;
  }

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
  sheet.getRange(1, 1, 1, 18).setValues([[
    '신청일시', '이름', '연락처', '이메일', '직책',
    '경력', '학원명', '관심주제', '어려운점', '마케팅동의',
    '상태', '후기작성', '교육대상', '활동지역', '인식도설문',
    '기대서비스', '차별점', 'DB화기대'
  ]]);
  sheet.getRange(1, 1, 1, 18).setFontWeight('bold');
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
  settingsSheet.getRange(1, 1, 6, 2).setValues([
    ['키', '값'],
    ['currentWeek', '1'],
    ['thisWeekTopic', '클로드코드 기본 세팅'],
    ['thisWeekDescription', '클로드코드 설치부터 MCP 연결, 클로드 스킬 세팅까지 한 번에 끝내는 시간입니다.'],
    ['preparation', '노트북 또는 데스크톱'],
    ['liveLink', ''],       // 유튜브 라이브 링크 (매주 수동 업데이트)
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
//   📅 일시: 매주 월요일 #{lectureTime}
//   📺 방식: 유튜브 라이브 (완전 무료)
//   ▶ 입장: #{liveLink}
//
//   확인 메일도 함께 보내드렸으니 확인해주세요!
//
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
function sendRegistrationAlimtalk(data, liveLink) {
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
        '#{liveLink}': liveLink || '(강의 당일 별도 안내)',
        '#{lectureTime}': CONFIG.LECTURE_TIME,
      },
    };
    // 알림톡 실패 시 LMS 대체 발송
    message.type = 'ATA';
    message.subject = '[수학비서] 강의 신청 완료';
    message.text = buildSmsText(data.name, liveLink);
  } else {
    // 템플릿 미등록 시 LMS로 발송
    message.type = 'LMS';
    message.subject = '[수학비서] 강의 신청 완료';
    message.text = buildSmsText(data.name, liveLink);
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
function buildSmsText(name, liveLink) {
  return [
    `${name}님, 수학비서 AI 활용법 강의 신청이 완료되었습니다!`,
    '',
    `📅 ${CONFIG.LECTURE_DAY} ${CONFIG.LECTURE_TIME}`,
    '📺 유튜브 라이브 (완전 무료)',
    liveLink ? `▶ ${liveLink}` : '※ 라이브 링크는 강의 당일 별도 안내드립니다.',
    '',
    '※ 문의: mathsecr@example.com',
  ].filter(Boolean).join('\n');
}
