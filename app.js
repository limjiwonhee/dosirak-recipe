const QUERIES = {
  all: '도시락 레시피 직장인 점심 밀프렙',
  kr:  '직장인 도시락 레시피 밀프렙',
  jp:  'お弁当 レシピ 簡単',
  en:  'work lunch meal prep easy',
};

const LANG_CONFIG = {
  kr: { badge: 'KR', cls: 'badge-kr', relevance: 'ko', region: 'KR' },
  jp: { badge: 'JP', cls: 'badge-jp', relevance: 'ja', region: 'JP' },
  en: { badge: 'EN', cls: 'badge-en', relevance: 'en', region: 'US' },
};

let currentLang = 'all';

// ── Vercel 서버리스 함수 or 로컬 .env 직접 호출 ───────────────
async function searchYoutube(query, lang) {
  const cfg = LANG_CONFIG[lang];

  // /api/search 가 있으면 사용 (Vercel 배포 / vercel dev)
  try {
    let url = `/api/search?q=${encodeURIComponent(query)}`;
    if (cfg) url += `&relevanceLanguage=${cfg.relevance}&regionCode=${cfg.region}`;

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
    // fetch 자체 실패(네트워크 오류 등)가 아닌 경우 그대로 던짐
    if (!(err instanceof TypeError)) throw err;
  }

  // 로컬 Python 서버용 폴백: .env 파일에서 키 직접 읽기
  const apiKey = await getLocalApiKey();
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다. .env 파일을 확인하거나 Vercel 환경변수를 설정해주세요.');

  let url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&maxResults=12` +
    `&q=${encodeURIComponent(query)}` +
    `&key=${apiKey}`;
  if (cfg) url += `&relevanceLanguage=${cfg.relevance}&regionCode=${cfg.region}`;

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
  $('noResults').classList.add('hidden');
  $('errorMsg').classList.add('hidden');
}

function hideLoading() { $('loading').classList.add('hidden'); }

function showError(msg) {
  const el = $('errorMsg');
  el.textContent = '⚠️ ' + msg;
  el.classList.remove('hidden');
}

// ── 검색 실행 ───────────────────────────────────────────────────
async function performSearch(query, lang) {
  if (!query.trim()) return;
  showLoading();
  try {
    const data = await searchYoutube(query, lang);
    hideLoading();
    const items = data.items || [];
    if (items.length === 0) {
      $('noResults').classList.remove('hidden');
      return;
    }
    $('results').innerHTML = items.map(item => buildCard(item, lang)).join('');
  } catch (err) {
    hideLoading();
    showError(err.message);
  }
}

// ── 탭 활성화 ───────────────────────────────────────────────────
function activateTab(lang) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.lang === lang)
  );
  currentLang = lang;
  const query = QUERIES[lang];
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

  // 초기 검색
  const defaultQuery = QUERIES.all;
  $('searchInput').value = defaultQuery;
  performSearch(defaultQuery, 'all');
});
