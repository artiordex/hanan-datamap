# 한국지역난방공사 공공데이터 JSON 브라우저

공공데이터포털에서 받은 한국지역난방공사 엑셀 파일을 정규화된 JSON으로 변환하고, 그 JSON을 바로 탐색할 수 있는 Vinext/Next 앱입니다.

## 데이터 생성

```bash
python scripts/extract_data.py
```

생성 파일:

- `public/data/hanan-datasets.json`

## 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm test
```
