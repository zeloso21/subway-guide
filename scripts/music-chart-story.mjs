// 세계·국가별 음악 차트와 신규 발매를 모아 게시판용 스토리 초안(마크다운)을 만든다.
//  - Apple Music RSS: 국가별 많이 재생된 곡 (키 불필요)
//  - Deezer: 전 세계 인기곡 차트, 에디터 추천 신규 발매 (키 불필요)
// 지난번 실행 결과(posts/music/latest.json)와 비교해 순위 변동(▲▼ NEW)도 표시한다.
// 사용법: node scripts/music-chart-story.mjs
//   COUNTRIES=kr,us,jp  국가 코드 (기본 kr,us,jp)
//   LIMIT=10            차트별 곡 수 (기본 10)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const COUNTRIES = (process.env.COUNTRIES || 'kr,us,jp').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const LIMIT = Math.max(1, Math.min(50, Number(process.env.LIMIT) || 10));
const OUT_DIR = new URL('../posts/music/', import.meta.url);
const SNAPSHOT = new URL('latest.json', OUT_DIR);

const COUNTRY_NAME = { kr: '한국', us: '미국', jp: '일본', gb: '영국', fr: '프랑스', de: '독일', br: '브라질', ca: '캐나다', au: '호주' };

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error).slice(0, 200));
      return json;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function appleTopSongs(cc) {
  const json = await getJson(`https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${LIMIT}/songs.json`);
  return json.feed.results.map(r => ({
    title: r.name,
    artist: r.artistName,
    url: r.url,
    image: r.artworkUrl100,
    genre: r.genres?.[0]?.name || '',
  }));
}

async function deezerGlobalChart() {
  const json = await getJson(`https://api.deezer.com/chart/0/tracks?limit=${LIMIT}`);
  return json.data.map(t => ({
    title: t.title,
    artist: t.artist.name,
    url: t.link,
    image: t.album?.cover_medium,
    preview: t.preview,
  }));
}

async function deezerNewReleases() {
  const json = await getJson(`https://api.deezer.com/editorial/0/releases?limit=${LIMIT}`);
  return json.data.map(a => ({
    title: a.title,
    artist: a.artist.name,
    url: a.link,
    image: a.cover_medium,
    released: a.release_date,
  }));
}

const keyOf = s => `${s.artist}\u0000${s.title}`.toLowerCase();

// 지난 순위와 비교한 변동 표시
function movement(prev, song, rank) {
  if (!prev) return '';
  const before = prev.indexOf(keyOf(song));
  if (before < 0) return '🆕';
  const diff = before + 1 - rank;
  return diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : '–';
}

const esc = s => String(s).replace(/([|*_\[\]])/g, '\\$1');

function chartTable(songs, prev) {
  const rows = songs.map((s, i) => {
    const link = s.url ? `[${esc(s.title)}](${s.url})` : esc(s.title);
    return `| ${i + 1} | ${movement(prev, s, i + 1)} | ${link} | ${esc(s.artist)} |`;
  });
  return ['| 순위 | 변동 | 곡 | 아티스트 |', '|---:|:---:|---|---|', ...rows].join('\n');
}

// 여러 차트에 동시에 오른 곡 = 이번 주 "세계적인 히트곡" 후보
function crossChartHits(charts) {
  const seen = new Map();
  for (const [label, songs] of charts) {
    for (const s of songs) {
      const k = keyOf(s);
      if (!seen.has(k)) seen.set(k, { song: s, labels: [] });
      seen.get(k).labels.push(label);
    }
  }
  return [...seen.values()].filter(v => v.labels.length >= 2).sort((a, b) => b.labels.length - a.labels.length);
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD

let prevSnapshot = {};
try { prevSnapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch {}
// 같은 날 다시 돌리면 오늘 결과가 아니라 그 이전 기록과 비교한다
const base = prevSnapshot.date === today ? prevSnapshot.previous || {} : prevSnapshot;
const prevRanks = base.ranks || {};

const jobs = [
  ...COUNTRIES.map(cc => [`apple-${cc}`, `🍎 ${COUNTRY_NAME[cc] || cc.toUpperCase()} 인기곡 (Apple Music)`, () => appleTopSongs(cc)]),
  ['deezer-global', '🌍 세계 인기곡 (Deezer)', deezerGlobalChart],
];
const results = await Promise.allSettled([...jobs.map(([, , fn]) => fn()), deezerNewReleases()]);

const charts = [];
const ranks = {};
results.slice(0, jobs.length).forEach((r, i) => {
  const [id, label] = jobs[i];
  if (r.status === 'rejected') return console.warn(`⚠️ ${label} 가져오기 실패: ${r.reason.message}`);
  charts.push([label, r.value, id]);
  ranks[id] = r.value.map(keyOf);
});
const releasesResult = results.at(-1);
const releases = releasesResult.status === 'fulfilled' ? releasesResult.value : [];
if (releasesResult.status === 'rejected') console.warn(`⚠️ 신규 발매 가져오기 실패: ${releasesResult.reason.message}`);

if (!charts.length && !releases.length) {
  console.error('모든 출처에서 데이터를 가져오지 못했습니다.');
  process.exit(1);
}

const md = [];
md.push(`# 🎧 이번 주 세계 음악 차트 (${today})`, '');
md.push('> ✍️ 도입부: 이번 주 차트의 분위기를 한두 문장으로 써 주세요.', '');

const hits = crossChartHits(charts.map(([label, songs]) => [label.replace(/^\S+\s/, '').replace(/ 인기곡.*/, ''), songs]));
if (hits.length) {
  md.push('## 🔥 여러 나라에서 동시에 사랑받는 곡', '');
  for (const { song, labels } of hits.slice(0, 5)) {
    md.push(`- **${esc(song.title)}** – ${esc(song.artist)} (${labels.join(', ')})`);
  }
  md.push('', '> ✍️ 이 곡들이 인기 있는 이유를 써 주세요.', '');
}

for (const [label, songs, id] of charts) {
  md.push(`## ${label}`, '', chartTable(songs, prevRanks[id]), '');
  const top = songs[0];
  if (top) md.push(`> ✍️ 1위 **${esc(top.title)}** – ${esc(top.artist)}에 대한 한 줄 코멘트`, '');
}

if (releases.length) {
  md.push('## 💿 주목할 신규 발매 (Deezer 에디터 추천)', '');
  for (const a of releases) {
    md.push(`- [${esc(a.title)}](${a.url}) – ${esc(a.artist)}${a.released ? ` (${a.released})` : ''}`);
  }
  md.push('', '> ✍️ 가장 기대되는 앨범 하나를 골라 소개해 주세요.', '');
}

md.push('---', '', '출처: Apple Music, Deezer. 순위 변동은 지난 게시글 기준입니다.', '');

await mkdir(OUT_DIR, { recursive: true });
const outFile = new URL(`${today}.md`, OUT_DIR);
await writeFile(outFile, md.join('\n'));
await writeFile(SNAPSHOT, JSON.stringify({ date: today, ranks: { ...prevRanks, ...ranks }, previous: { date: base.date, ranks: prevRanks } }, null, 2) + '\n');
console.log(`초안 작성 완료: posts/music/${today}.md (차트 ${charts.length}개, 신규 발매 ${releases.length}개)`);
