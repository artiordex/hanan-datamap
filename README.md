# 한난 데이터맵

한국지역난방공사 공공데이터 JSON을 정적으로 제공하고, Vite로 빌드한 단일 페이지 데이터맵입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## Cloudflare Pages 설정

GitHub 저장소를 Cloudflare Pages에 연결한 뒤 아래 값으로 설정합니다.

| 항목 | 값 |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 저장소 루트가 이 폴더면 비워두고, 상위 저장소 안에 있으면 `datamap-web` |
| Node.js version | `22.13.0` |

배포 후 JSON 파일은 아래 경로로 정적으로 제공됩니다.

```text
/data/hanan-datasets.json
```
