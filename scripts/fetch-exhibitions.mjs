// 서울 열린데이터광장 "서울시 문화행사 정보"(culturalEventInfo)에서
// 전시/미술 행사만 골라 data/exhibitions.json 으로 저장한다.
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

async function fetchPage(start, end) {
  const url = `${BASE}/${encodeURIComponent(KEY)}/json/culturalEventInfo/${start}/${end}/`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const body = json.culturalEventInfo;
      if (!body) throw new Error(JSON.stringify(json.RESULT || json).slice(0, 200));
      return body;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

// "2026-10-01 00:00:00.0" → "2026-10-01"
const day = s => (s || '').slice(0, 10);
const https = u => (u || '').trim().replace(/^http:\/\//i, 'https://');

// 원본 데이터는 LAT/LOT 값이 뒤바뀌어 들어오는 경우가 있어 범위로 판별한다.
function coords(a, b) {
  const x = parseFloat(a), y = parseFloat(b);
  if (!isFinite(x) || !isFinite(y)) return null;
  if (x > 33 && x < 39 && y > 124 && y < 132) return [x, y];
  if (y > 33 && y < 39 && x > 124 && x < 132) return [y, x];
  return null;
}

const first = await fetchPage(1, PAGE);
const total = first.list_total_count;
const rows = [...first.row];
for (let s = PAGE + 1; s <= total; s += PAGE) {
  const page = await fetchPage(s, Math.min(s + PAGE - 1, total));
  rows.push(...page.row);
}

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST
const seen = new Set();
const items = [];
for (const r of rows) {
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
    desc: (r.PROGRAM || r.ETC_DESC || '').trim(),
    image: https(r.MAIN_IMG),
    link: https(r.ORG_LINK || r.HMPG_ADDR),
    lat: ll ? ll[0] : null,
    lng: ll ? ll[1] : null,
  });
}
items.sort((a, b) => a.end.localeCompare(b.end));

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  updatedAt: new Date().toISOString(),
  source: '서울 열린데이터광장 · 서울시 문화행사 정보',
  count: items.length,
  items,
}, null, 1) + '\n');
console.log(`전체 ${total}건 중 전시/미술 ${items.length}건 저장`);
