const KEYWORD_POOLS = {
  kr: [
    '샐러드 도시락',
    '다이어트 도시락',
    '한그릇 도시락',
    '간단 도시락',
    '초간단 도시락',
    '밀프렙',
    '주말 밀프렙',
    '일주일 도시락 준비',
    '도시락 반찬 만들기',
    '도시락 밑반찬',
    '직장인 점심',
    '점심 도시락',
    '혼밥 도시락',
    '다이어트 점심',
    '저칼로리 도시락',
    '직장인 도시락',
    '회사 도시락',
    '출근 도시락',
  ],
  en: [
    'meal prep',
    'weekly meal prep',
    'healthy meal prep',
    'lunch meal prep',
    'meal prep for work',
    'bento meal prep',
    'meal prep under 500 calories',
    'office lunch',
    'work lunch ideas',
    'work lunch prep',
    'corporate lunchbox',
    'high protein lunch',
    'healthy lunch box',
    'weight loss lunch',
    'low calorie lunch box',
    'protein meal prep',
    'macro friendly meal prep',
    'packed lunch ideas',
    'homemade lunch box',
    'easy lunch box',
    'simple lunch recipes',
    'realistic meal prep',
    'lazy meal prep',
  ],
  jp: [
    'japanese bento',
    'bento making',
    'bento prep',
    'bento for work',
    'お弁当',
    '作り置き弁当',
  ],
};
KEYWORD_POOLS.all = [
  ...KEYWORD_POOLS.kr,
  ...KEYWORD_POOLS.en,
  ...KEYWORD_POOLS.jp,
];

const MODIFIERS = {
  kr:  ['간단', '초보', '10분', '20분', '빠른', '저칼로리', '2024', '2025'],
  en:  ['easy', 'beginner', '10 minutes', 'quick', 'healthy', '2024', '2025'],
  jp:  ['簡単', '初心者', '10分', 'おすすめ', '2024', '2025'],
  all: ['간단', 'easy', '簡単', '2024', '2025'],
};

const ORDER_OPTIONS = ['relevance', 'date', 'rating', 'viewCount'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickOrder() {
  return pickRandom(ORDER_OPTIONS);
}

function buildQuery(lang) {
  const pool = KEYWORD_POOLS[lang] || KEYWORD_POOLS.all;
  const keyword = pickRandom(pool);
  const mods = MODIFIERS[lang] || [];
  if (mods.length > 0 && Math.random() < 0.5) {
    return `${keyword} ${pickRandom(mods)}`;
  }
  return keyword;
}

const LANG_CONFIG = {
  kr: { badge: 'KR', cls: 'badge-kr', relevance: 'ko', region: 'KR' },
  jp: { badge: 'JP', cls: 'badge-jp', relevance: 'ja', region: 'JP' },
  en: { badge: 'EN', cls: 'badge-en', relevance: 'en', region: 'US' },
};

let currentLang = 'all';
let currentQuery = '';
let nextPageToken = '';   // 다음 페이지 토큰
let pageIndex = 0;        // 몇 번째 페이지인지 표시용

// ── Vercel 서버리스 함수 or 로컬 .env 직접 호출 ───────────────
async function searchYoutube(query, lang, pageToken = '') {
  const cfg = LANG_CONFIG[lang];
  const order = pickOrder();

  // /api/search 가 있으면 사용 (Vercel 배포 / vercel dev)
  try {
    let url = `/api/search?q=${encodeURIComponent(query)}&order=${order}`;
    if (cfg) url += `&relevanceLanguage=${cfg.relevance}&regionCode=${cfg.region}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url);
    if (res.ok || res.status === 400) {
      const data = await res.json();
      if (res.ok) return data;
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
    // 404 → 서버리스 없음, 로컬 .env 폴백으로 이동
    if (res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
  }

  // 로컬 Python 서버용 폴백: .env 파일에서 키 직접 읽기
  const apiKey = await getLocalApiKey();
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다. .env 파일을 확인하거나 Vercel 환경변수를 설정해주세요.');

  let url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&maxResults=12` +
    `&q=${encodeURIComponent(query)}` +
    `&order=${order}` +
    `&key=${apiKey}`;
  if (cfg) url += `&relevanceLanguage=${cfg.relevance}&regionCode=${cfg.region}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getLocalApiKey() {
  try {
    const res = await fetch('.env');
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/YOUTUBE_API_KEY=([^\r\n]+)/);
    if (match) {
      const key = match[1].trim();
      return key && key !== '여기에키입력' ? key : null;
    }
  } catch { /* ignore */ }
  return null;
}

// ── 언어 자동 감지 ─────────────────────────────────────────────
function detectLang(title) {
  if (/[가-힯]/.test(title)) return 'kr';
  if (/[぀-ヿ]/.test(title)) return 'jp';
  return 'en';
}

// ── 카드 HTML 생성 ──────────────────────────────────────────────
function buildCard(item, lang) {
  const { snippet, id } = item;
  const videoUrl = `https://www.youtube.com/watch?v=${id.videoId}`;
  const thumb = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '';
  const desc = snippet.description
    ? snippet.description.slice(0, 100) + (snippet.description.length > 100 ? '…' : '')
    : '';
  const detectedLang = lang === 'all' ? detectLang(snippet.title) : lang;
  const cfg = LANG_CONFIG[detectedLang] || LANG_CONFIG.en;

  return `
    <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="card">
      <div class="card-thumbnail">
        <img src="${thumb}" alt="" loading="lazy" />
        <span class="badge ${cfg.cls}">${cfg.badge}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(snippet.title)}</h3>
        <p class="card-channel">${escapeHtml(snippet.channelTitle)}</p>
        ${desc ? `<p class="card-desc">${escapeHtml(desc)}</p>` : ''}
      </div>
    </a>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── UI 헬퍼 ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showLoading() {
  $('loading').classList.remove('hidden');
  $('results').innerHTML = '';
  $('resultsHeader').classList.add('hidden');
  $('noResults').classList.add('hidden');
  $('errorMsg').classList.add('hidden');
}

function hideLoading() { $('loading').classList.add('hidden'); }

function showError(msg) {
  const el = $('errorMsg');
  el.textContent = '⚠️ ' + msg;
  el.classList.remove('hidden');
  $('resultsHeader').classList.add('hidden');
}

function renderResults(items, lang) {
  $('results').innerHTML = items.map(item => buildCard(item, lang)).join('');

  // 결과 헤더 표시
  const header = $('resultsHeader');
  const meta = $('resultsMeta');
  meta.textContent = pageIndex === 0
    ? `${items.length}개 영상`
    : `${items.length}개 영상 · ${pageIndex + 1}페이지`;
  header.classList.remove('hidden');

  // 버튼 레이블 업데이트
  const btn = $('refreshBtn');
  btn.querySelector('svg ~ text, svg + *');
  btn.lastChild.textContent = ' 다른 영상 보기';
}

// ── 검색 실행 (새 검색 — 페이지 초기화) ────────────────────────
async function performSearch(query, lang) {
  if (!query.trim()) return;
  currentQuery = query;
  currentLang = lang;
  nextPageToken = '';
  pageIndex = 0;

  showLoading();
  try {
    const data = await searchYoutube(query, lang, '');
    nextPageToken = data.nextPageToken || '';
    hideLoading();

    const items = data.items || [];
    if (items.length === 0) {
      $('noResults').classList.remove('hidden');
      return;
    }
    renderResults(items, lang);
  } catch (err) {
    hideLoading();
    showError(err.message);
  }
}

// ── 다른 영상 보기 (랜덤 키워드로 새 검색) ─────────────────────
async function performRefresh() {
  if (!currentLang) return;

  const btn = $('refreshBtn');
  btn.disabled = true;
  btn.classList.add('spinning');

  const newQuery = buildQuery(currentLang);
  $('searchInput').value = newQuery;

  try {
    await performSearch(newQuery, currentLang);
    $('resultsHeader').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
  }
}

// ── 탭 활성화 ───────────────────────────────────────────────────
function activateTab(lang) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.lang === lang)
  );
  currentLang = lang;
  const query = buildQuery(lang);
  $('searchInput').value = query;
  performSearch(query, lang);
}

// ── 초기화 ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => activateTab(tab.dataset.lang))
  );

  $('searchBtn').addEventListener('click', () => {
    const q = $('searchInput').value.trim();
    if (q) performSearch(q, currentLang);
  });

  $('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = $('searchInput').value.trim();
      if (q) performSearch(q, currentLang);
    }
  });

  $('refreshBtn').addEventListener('click', performRefresh);

  // 초기 검색
  const defaultQuery = buildQuery('all');
  $('searchInput').value = defaultQuery;
  performSearch(defaultQuery, 'all');
});
