// 서울 열린데이터광장에서 전시 정보를 모아 data/exhibitions.json 으로 저장한다.
//  - 서울시 문화행사 정보(culturalEventInfo): 전시/미술 분류만
//  - 서울시립미술관 전시 정보(ListExhibitionOfSeoulMOAInfo)
// 사용법: SEOUL_API_KEY=발급키 node scripts/fetch-exhibitions.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const KEY = process.env.SEOUL_API_KEY;
if (!KEY) {
  console.error('SEOUL_API_KEY 환경변수가 없습니다.');
  process.exit(1);
}

const BASE = process.env.SEOUL_API_BASE || 'http://openapi.seoul.go.kr:8088';
const PAGE = 1000;
const OUT = new URL('../data/exhibitions.json', import.meta.url);

async function fetchPage(service, start, end) {
  const url = `${BASE}/${encodeURIComponent(KEY)}/json/${service}/${start}/${end}/`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const body = json[service];
      if (!body) throw new Error(JSON.stringify(json.RESULT || json).slice(0, 200));
      return body;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function fetchAll(service) {
  const first = await fetchPage(service, 1, PAGE);
  const total = first.list_total_count;
  const rows = [...(first.row || [])];
  for (let s = PAGE + 1; s <= total; s += PAGE) {
    const page = await fetchPage(service, s, Math.min(s + PAGE - 1, total));
    rows.push(...page.row);
  }
  return rows;
}

// "2026-10-01 00:00:00.0", "2026.10.01", "20261001" → "2026-10-01"
function day(s) {
  const d = String(s || '').replace(/\D/g, '').slice(0, 8);
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : '';
}
const https = u => (u || '').trim().replace(/^http:\/\//i, 'https://');
// HTML 설명을 줄바꿈만 살린 평문으로
const ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', ndash: '–', mdash: '—', middot: '·', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', times: '×', bull: '•' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m);
const text = s => decode(String(s || '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, ''))
  .replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
// 필드 이름이 달라도 버티도록 후보 중 값이 있는 첫 필드를 쓴다.
const pick = (r, ...names) => { for (const n of names) if (r[n] != null && String(r[n]).trim()) return String(r[n]).trim(); return ''; };
// 제목 비교용: 앞의 [기관명], 기호, 공백 제거
const norm = s => String(s || '').replace(/^\s*\[[^\]]*\]\s*/, '').replace(/[^0-9a-zA-Z가-힣]/g, '').toLowerCase();

// 원본 데이터는 LAT/LOT 값이 뒤바뀌어 들어오는 경우가 있어 범위로 판별한다.
function coords(a, b) {
  const x = parseFloat(a), y = parseFloat(b);
  if (!isFinite(x) || !isFinite(y)) return null;
  if (x > 33 && x < 39 && y > 124 && y < 132) return [x, y];
  if (y > 33 && y < 39 && x > 124 && x < 132) return [y, x];
  return null;
}

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST

// 1) 서울시 문화행사 정보
const cultural = await fetchAll('culturalEventInfo');
const seen = new Set();
const items = [];
for (const r of cultural) {
  if (!/전시|미술/.test(r.CODENAME || '')) continue;
  const start = day(r.STRTDATE), end = day(r.END_DATE);
  if (!end || end < today) continue;
  const key = `${r.TITLE}|${r.PLACE}|${start}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const ll = coords(r.LAT, r.LOT);
  items.push({
    title: (r.TITLE || '').trim(),
    category: r.CODENAME,
    gu: r.GUNAME || '',
    place: (r.PLACE || '').trim(),
    org: r.ORG_NAME || '',
    start, end,
    fee: (r.USE_FEE || '').trim(),
    free: r.IS_FREE === '무료',
    target: (r.USE_TRGT || '').trim(),
    artist: (r.PLAYER || '').trim(),
    desc: text(r.PROGRAM || r.ETC_DESC),
    image: https(r.MAIN_IMG),
    link: https(r.ORG_LINK || r.HMPG_ADDR),
    lat: ll ? ll[0] : null,
    lng: ll ? ll[1] : null,
    source: 'cultural',
  });
}
const culturalCount = items.length;

// 2) 서울시립미술관 전시 정보 — 실패해도 문화행사 데이터는 저장한다.
// 시립미술관 분관 위치. 문화행사 데이터에 같은 분관이 있으면 그 좌표·자치구를 먼저 쓴다.
// (key는 다른 장소와 헷갈리지 않도록 분관 이름 전체를 쓴다. 예: '북서울'은 북서울꿈의숲과 겹침)
const SEMA_BRANCHES = [
  { key: '서소문본관', gu: '중구', lat: 37.5641, lng: 126.9737 },
  { key: '북서울미술관', gu: '노원구', lat: 37.6407, lng: 127.0666 },
  { key: '남서울미술관', gu: '관악구', lat: 37.4758, lng: 126.9794 },
  { key: '서서울미술관', gu: '금천구', lat: null, lng: null },
  { key: '사진미술관', gu: '도봉구', lat: null, lng: null },
  { key: '미술아카이브', gu: '종로구', lat: null, lng: null },
  { key: '백남준', gu: '종로구', lat: null, lng: null },
];
for (const b of SEMA_BRANCHES) {
  const hit = cultural.find(r => (r.PLACE || '').includes(b.key) && coords(r.LAT, r.LOT));
  if (hit) {
    [b.lat, b.lng] = coords(hit.LAT, hit.LOT);
    b.gu = hit.GUNAME || b.gu;
  }
}

let semaAdded = 0, semaMerged = 0;
try {
  const rows = await fetchAll('ListExhibitionOfSeoulMOAInfo');
  if (rows[0]) console.log('시립미술관 필드:', Object.keys(rows[0]).join(', '));
  for (const r of rows) {
    const title = text(pick(r, 'DP_NAME', 'DP_SUBJECT', 'TITLE'));
    const start = day(pick(r, 'DP_START', 'DP_START_DATE', 'STRTDATE'));
    const end = day(pick(r, 'DP_END', 'DP_END_DATE', 'END_DATE'));
    if (!title || !end || end < today) continue;
    let place = text(pick(r, 'DP_PLACE', 'PLACE'));
    if (place === '기타') place = '';
    // 분관 밖(자치구 협력전 등)에서 열리는 전시는 위치를 알 수 없어 지도에 찍지 않는다.
    const branch = SEMA_BRANCHES.find(b => place.includes(b.key)) || { gu: '', lat: null, lng: null };
    const fee = text(pick(r, 'DP_VIEWCHARGE', 'DP_CHARGE', 'USE_FEE'));
    const sema = {
      title,
      category: '전시/미술',
      gu: branch.gu,
      place: place || '서울시립미술관 (장소는 전시 홈페이지 참고)',
      org: '서울시립미술관',
      start, end,
      fee,
      free: !fee || /무료/.test(fee),
      target: '',
      hours: text(pick(r, 'DP_VIEWTIME')),
      artist: text(pick(r, 'DP_ARTIST', 'PLAYER')),
      desc: text(pick(r, 'DP_INFO', 'DP_DESC', 'DP_SUBNAME')),
      image: https(pick(r, 'DP_MAIN_IMG', 'DP_IMG', 'MAIN_IMG')),
      link: https(pick(r, 'DP_LNK', 'DP_LINK', 'DP_HOMEPAGE')),
      lat: branch.lat,
      lng: branch.lng,
      source: 'sema',
    };
    // 문화행사 정보에 이미 있는 전시면 합치고, 비어 있는 항목만 채운다.
    const n = norm(title);
    const dup = n.length > 3 && items.find(e => e.source === 'cultural' &&
      norm(e.title).length > 3 &&
      (norm(e.title).includes(n) || n.includes(norm(e.title))) && e.start <= end && start <= e.end);
    if (dup) {
      for (const k of ['artist', 'desc', 'image', 'link', 'fee', 'hours']) if (!dup[k] && sema[k]) dup[k] = sema[k];
      dup.source = 'both';
      semaMerged++;
    } else {
      items.push(sema);
      semaAdded++;
    }
  }
} catch (e) {
  console.warn('시립미술관 전시 정보를 가져오지 못했습니다:', e.message);
}

items.sort((a, b) => a.end.localeCompare(b.end));

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  updatedAt: new Date().toISOString(),
  source: '서울 열린데이터광장 · 서울시 문화행사 정보, 서울시립미술관 전시 정보',
  count: items.length,
  items,
}, null, 1) + '\n');
console.log(`문화행사 ${cultural.length}건 중 전시/미술 ${culturalCount}건, 시립미술관 추가 ${semaAdded}건·병합 ${semaMerged}건 → 총 ${items.length}건 저장`);
