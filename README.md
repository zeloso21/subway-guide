# 서울 전시 지도

서울 열린데이터광장의 [서울시 문화행사 정보](https://data.seoul.go.kr/dataList/OA-15486/S/1/datasetView.do)에서
**전시/미술** 행사를 고르고 서울시립미술관 전시 정보(`ListExhibitionOfSeoulMOAInfo`)와 합쳐, 지금 갈 수 있는 전시를 목록과 지도로 보여주는 웹앱입니다.

## 구조
- `index.html` — 웹앱 전체 (목록·지도·필터·상세, Leaflet + OpenStreetMap)
- `data/exhibitions.json` — 전시 데이터 (자동 생성)
- `scripts/fetch-exhibitions.mjs` — 서울시 API 두 곳에서 전시를 받아 합친 뒤 위 JSON을 만드는 스크립트
- `.github/workflows/update-exhibitions.yml` — 매일 05:17(KST)에 스크립트를 돌려 데이터를 갱신

서울시 API는 `http`만 지원해서 `https` 페이지에서 직접 부를 수 없기 때문에,
GitHub Actions가 데이터를 받아 JSON 파일로 저장하고 웹은 그 파일만 읽습니다.

## 처음 설정
1. [서울 열린데이터광장](https://data.seoul.go.kr)에서 로그인 → 마이페이지 → **인증키 신청** (일반 인증키)
2. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `SEOUL_API_KEY`, Value: 발급받은 인증키
3. Actions 탭 → "전시 데이터 갱신" → **Run workflow**

## 로컬에서 데이터 받기
```sh
SEOUL_API_KEY=발급키 node scripts/fetch-exhibitions.mjs
```

## 음악 차트 스토리 초안 만들기
`scripts/music-chart-story.mjs`는 Apple Music(국가별 인기곡)과 Deezer(세계 인기곡, 신규 발매)에서 차트를 받아
게시판에 올릴 마크다운 초안을 `posts/music/날짜.md`로 만듭니다. API 키는 필요 없습니다.

```sh
node scripts/music-chart-story.mjs                    # 한국·미국·일본, 각 10곡
COUNTRIES=kr,us,gb LIMIT=20 node scripts/music-chart-story.mjs
```
- 여러 나라 차트에 동시에 오른 곡을 "세계적인 히트곡"으로 따로 모아 줍니다.
- 지난번 실행 결과(`posts/music/latest.json`)와 비교해 순위 변동(▲▼ 🆕)을 표시합니다.
- `✍️`로 표시된 자리에 직접 코멘트를 채워 넣은 뒤 게시하세요. 기사 복사나 앨범 커버 재업로드는 피하고 링크로 연결하세요.
