# 사진 등록 방법

이 폴더는 "맛집찾기" 기능에서 보여줄 실제 사진을 담습니다.

## 등록 절차 (사용자 → Claude)
1. 방문한 맛집·카페 사진을 찍어서 Claude에게 전달
2. 카카오 장소 ID(placeId), 상호명, 좌표를 같이 확인해서 `../places.json`에 항목 추가
3. 사진 파일은 `photos/{placeId}.jpg` 형식으로 저장 (placeId로 매칭하므로 파일명 규칙 필수)

## places.json 구조
```json
[
  {
    "placeId": "1579165724",
    "name": "마루심 마포점",
    "category": "food",
    "lat": 37.5395,
    "lng": 126.9435,
    "photo": "photos/1579165724.jpg",
    "note": "짧은 추천 코멘트 (선택)"
  }
]
```

- `category`는 `food` 또는 `cafe`
- `placeId`는 카카오 로컬 API 응답의 `id` 필드와 일치해야 앱에서 매칭됨 (검색 결과에 없는 곳은 아직 표시 안 됨 — v1 한계)
