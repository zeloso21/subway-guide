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
