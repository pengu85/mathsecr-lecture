// ── GAS URL (배포 후 실제 URL로 교체) ──
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxXxJX26_mWoGUYYmh-9SwmzPH3A41rtVm4IMylyHZ6aIOSiXK6-O5ZXDQKFAQC5lMa4g/exec';
const IS_DEMO = GAS_URL.includes('AKfycbxXxJX26_mWoGUYYmh');

// ── 후기 동적 로딩 ──
(async function loadReviews() {
  if (IS_DEMO) return; // 데모 모드에서는 하드코딩 후기 유지
  try {
    const res = await fetch(GAS_URL + '?action=reviews');
    const json = await res.json();
    if (!json.success || !json.data || json.data.length === 0) return;

    const grid = document.getElementById('reviewGrid');
    grid.innerHTML = json.data.map(r => `
      <div class="review-card">
        <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
        <p class="review-text">"${escapeHtml(r.comment)}"</p>
        <div class="review-author">${escapeHtml(r.name)}</div>
      </div>
    `).join('');
  } catch (e) {
    console.log('후기 로딩 실패, 기본 후기 표시:', e);
  }
})();

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Floating CTA visibility ──
const floatingCta = document.getElementById('floatingCta');
const heroSection = document.querySelector('.hero');
const formSection = document.getElementById('register');

function updateFloatingCta() {
  const heroBottom = heroSection.getBoundingClientRect().bottom;
  const formTop = formSection.getBoundingClientRect().top;
  const windowHeight = window.innerHeight;

  if (heroBottom < 0 && formTop > windowHeight) {
    floatingCta.classList.add('visible');
  } else {
    floatingCta.classList.remove('visible');
  }
}

window.addEventListener('scroll', updateFloatingCta);

// ── FAQ Toggle ──
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// ── Phone number formatting ──
const phoneInput = document.querySelector('input[name="phone"]');
phoneInput.addEventListener('input', (e) => {
  let val = e.target.value.replace(/[^0-9]/g, '');
  if (val.length > 11) val = val.slice(0, 11);
  if (val.length > 7) {
    val = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7);
  } else if (val.length > 3) {
    val = val.slice(0, 3) + '-' + val.slice(3);
  }
  e.target.value = val;
});

// ── Step 1: Registration Form → Open Survey Modal ──
const form = document.getElementById('registrationForm');
const submitBtn = document.getElementById('submitBtn');
let pendingFormData = null; // 폼 데이터를 임시 저장

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const role = form.role.value;
  const privacy = form.privacy.checked;

  if (!name || !phone || !email || !role) {
    alert('필수 항목을 모두 입력해주세요.');
    return;
  }
  if (!privacy) {
    alert('개인정보 수집 및 이용에 동의해주세요.');
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('올바른 이메일 주소를 입력해주세요.');
    return;
  }

  // 폼 데이터 임시 저장
  pendingFormData = {
    name,
    phone,
    email,
    role,
    experience: form.experience.value || '',
    academy: form.academy.value.trim(),
    interest: form.interest.value || '',
    challenge: form.challenge.value.trim(),
    marketing: true,
  };

  // 설문 모달 열기
  document.getElementById('surveyModal').classList.add('active');
  document.body.style.overflow = 'hidden';
});

// ── Survey Modal: Chip toggle ──
document.querySelectorAll('.chip-group .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('selected');
  });
});

// ── Survey Modal: O/X toggle + progress ──
const allQuestions = ['db1','db2','db3','db4','search1','search2','search3','search4','search5','diff1','diff2','diff3','diff4','svc1','svc2','svc3'];

function updateSurveyProgress() {
  let answered = 0;
  allQuestions.forEach(q => {
    if (document.querySelector(`#surveyModal .ox-btn[data-q="${q}"].selected-o, #surveyModal .ox-btn[data-q="${q}"].selected-x`)) {
      answered++;
    }
  });
  const total = allQuestions.length;
  const pct = Math.round((answered / total) * 100);
  document.getElementById('surveyProgressFill').style.width = pct + '%';
  document.getElementById('surveyProgressText').textContent = answered + ' / ' + total;
}

document.querySelectorAll('#surveyModal .ox-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.q;
    const val = btn.dataset.val;
    document.querySelectorAll(`#surveyModal .ox-btn[data-q="${q}"]`).forEach(b => {
      b.classList.remove('selected-o', 'selected-x');
    });
    btn.classList.add(val === 'O' ? 'selected-o' : 'selected-x');
    updateSurveyProgress();
  });
});

// ── Step 2: Survey Submit → Send all data ──
const surveySubmitBtn = document.getElementById('surveySubmitBtn');

surveySubmitBtn.addEventListener('click', async () => {
  // O/X 전체 답변 체크
  let answered = 0;
  allQuestions.forEach(q => {
    if (document.querySelector(`#surveyModal .ox-btn[data-q="${q}"].selected-o, #surveyModal .ox-btn[data-q="${q}"].selected-x`)) {
      answered++;
    }
  });
  if (answered < allQuestions.length) {
    alert('O/X 문항을 모두 체크해주세요. (' + answered + '/' + allQuestions.length + ')');
    return;
  }

  surveySubmitBtn.disabled = true;
  surveySubmitBtn.textContent = '제출 중...';

  // 교육 대상
  const eduTargets = [];
  document.querySelectorAll('#eduTarget .chip.selected').forEach(c => {
    eduTargets.push(c.dataset.value);
  });

  // O/X 답변 수집
  const surveyAnswers = {};
  allQuestions.forEach(q => {
    const selected = document.querySelector(`#surveyModal .ox-btn[data-q="${q}"].selected-o, #surveyModal .ox-btn[data-q="${q}"].selected-x`);
    surveyAnswers[q] = selected ? selected.dataset.val : '';
  });

  // 최종 데이터 합치기
  const finalData = {
    ...pendingFormData,
    eduTarget: eduTargets.join(','),
    region: document.getElementById('surveyRegion').value || '',
    survey: surveyAnswers,
    surveyExpectation: document.getElementById('surveyExpectation').value.trim(),
    surveyDifferentiator: document.getElementById('surveyDifferentiator').value.trim(),
    surveyDbExpectation: document.getElementById('surveyDbExpectation').value.trim(),
    submittedAt: new Date().toISOString()
  };

  try {
    if (IS_DEMO) {
      console.log('데모 모드 - 전체 데이터:', finalData);
      await new Promise(resolve => setTimeout(resolve, 800));
    } else {
      await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
        mode: 'no-cors',
      });
    }

    // 설문 모달 닫기 → 완료 모달 열기
    document.getElementById('surveyModal').classList.remove('active');
    document.getElementById('successModal').classList.add('active');

    // GA4 전환 이벤트
    if (typeof gtag === 'function') {
      gtag('event', 'sign_up', {
        method: 'landing_page',
        event_category: 'registration',
      });
    }
    form.reset();
    pendingFormData = null;

  } catch (error) {
    console.error('신청 오류:', error);
    alert('신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    surveySubmitBtn.disabled = false;
    surveySubmitBtn.textContent = '설문 완료하고 신청하기';
  }
});

// ── Modal close ──
function closeModal() {
  document.getElementById('successModal').classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('successModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ── Smooth scroll ──
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
