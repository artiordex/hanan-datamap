"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { datasets, sourceSnapshot, type DatasetRecord } from "./data";

const domainOrder = [
  "에너지 수요·생산",
  "설비·자산",
  "환경·안전",
  "지역·공급",
  "고객·요금",
  "경영·행정",
  "AI·이미지",
  "기타",
] as const;

const domainStyles: Record<string, { accent: string; soft: string }> = {
  "에너지 수요·생산": { accent: "#0f766e", soft: "#dff5f1" },
  "설비·자산": { accent: "#2f4f99", soft: "#e9efff" },
  "환경·안전": { accent: "#2ab7a9", soft: "#e8fbf7" },
  "지역·공급": { accent: "#e95d6a", soft: "#ffe9ec" },
  "고객·요금": { accent: "#f58232", soft: "#fff0e3" },
  "경영·행정": { accent: "#476400", soft: "#edf7d8" },
  "AI·이미지": { accent: "#8e69dc", soft: "#f0eafd" },
  기타: { accent: "#a86f6f", soft: "#f8ecec" },
};

const domainDescriptions: Record<string, string> = {
  "에너지 수요·생산":
    "열생산, 열공급, 발전량, 전력수요, 연료사용처럼 에너지 흐름을 나타내는 데이터가 모여 있습니다.",
  "설비·자산":
    "열수송관, 맨홀, 밸브, 배관, 공급시설, 지사별 설비용량처럼 물리 자산과 유지관리 데이터를 묶었습니다.",
  "환경·안전":
    "온실가스, 배출계수, 기상관측, 태양광, 안전 진단 등 환경과 안전 판단에 쓰이는 데이터입니다.",
  "지역·공급":
    "지역별, 지사별, 권역별 공급현황처럼 공간 단위로 한난 데이터를 찾는 경로입니다.",
  "고객·요금":
    "열요금, 세대, 건물, 계량기, 고객서비스처럼 사용처와 요금 흐름에 가까운 데이터입니다.",
  "경영·행정":
    "입찰, 계약, 감사, ESG, 공시, 조직 등 기관 운영과 행정 성격의 데이터를 모았습니다.",
  "AI·이미지":
    "학습용 이미지, 열화상, 항공사진 등 모델 학습이나 시각 분석에 가까운 데이터입니다.",
  기타: "주요 업무 도메인 규칙에 바로 묶이지 않는 데이터입니다.",
};

const bubblePlacements: Record<string, { x: number; y: number; size: number }> = {
  "에너지 수요·생산": { x: 74, y: 49, size: 124 },
  "설비·자산": { x: 37, y: 25, size: 116 },
  "환경·안전": { x: 63, y: 19, size: 116 },
  "지역·공급": { x: 29, y: 56, size: 112 },
  "고객·요금": { x: 64, y: 79, size: 112 },
  "경영·행정": { x: 33, y: 78, size: 108 },
  "AI·이미지": { x: 82, y: 30, size: 104 },
  기타: { x: 52, y: 12, size: 96 },
};

const quickTerms = [
  "지역난방",
  "지사별",
  "태양광",
  "온실가스",
  "열요금",
  "열수송관",
  "전력수요",
  "기상관측",
] as const;

type KindFilter = "전체" | "file" | "api";

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function getDomainStyle(domain: string) {
  return domainStyles[domain] ?? domainStyles.기타;
}

function toStyle(domain: string, extra?: Record<string, string | number>) {
  const style = getDomainStyle(domain);
  return {
    "--accent": style.accent,
    "--soft": style.soft,
    ...extra,
  } as CSSProperties;
}

function searchBlob(record: DatasetRecord) {
  return [
    record.title,
    record.domain,
    record.category,
    record.format,
    record.timeScale,
    record.spaceScale,
    record.description,
    ...record.keywords,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesQuery(record: DatasetRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  return normalized.length === 0 || searchBlob(record).includes(normalized);
}

function topKeywords(records: DatasetRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const keyword of record.keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([keyword]) => keyword);
}

export function DataMapClient() {
  const [query, setQuery] = useState("");
  const [resultQuery, setResultQuery] = useState("");
  const [activeKind, setActiveKind] = useState<KindFilter>("전체");
  const [selectedDomain, setSelectedDomain] = useState("에너지 수요·생산");
  const [selectedId, setSelectedId] = useState("");
  const [legendOpen, setLegendOpen] = useState(true);
  const [zoom, setZoom] = useState(1);

  const baseRecords = useMemo(() => {
    return datasets.filter((record) => {
      const kindMatch = activeKind === "전체" || record.kind === activeKind;
      return kindMatch && matchesQuery(record, query);
    });
  }, [activeKind, query]);

  const domainStats = useMemo(() => {
    return domainOrder.map((domain) => {
      const records = baseRecords.filter((record) => record.domain === domain);
      return {
        domain,
        count: records.length,
        fileCount: records.filter((record) => record.kind === "file").length,
        apiCount: records.filter((record) => record.kind === "api").length,
        views: records.reduce((sum, record) => sum + record.views, 0),
        downloads: records.reduce((sum, record) => sum + record.downloads, 0),
        applications: records.reduce(
          (sum, record) => sum + record.applications,
          0,
        ),
        keywords: topKeywords(records),
      };
    });
  }, [baseRecords]);

  const selectedStat =
    domainStats.find((stat) => stat.domain === selectedDomain) ?? domainStats[0];

  const selectedRecords = useMemo(() => {
    return baseRecords
      .filter((record) => record.domain === selectedStat.domain)
      .filter((record) => matchesQuery(record, resultQuery))
      .sort((a, b) => b.views - a.views);
  }, [baseRecords, resultQuery, selectedStat.domain]);

  const selectedRecord =
    selectedRecords.find((record) => record.id === selectedId) ??
    selectedRecords[0] ??
    baseRecords[0] ??
    datasets[0];

  const totals = useMemo(() => {
    return {
      all: datasets.length,
      visible: baseRecords.length,
      files: baseRecords.filter((record) => record.kind === "file").length,
      apis: baseRecords.filter((record) => record.kind === "api").length,
    };
  }, [baseRecords]);

  const maxDomainCount = Math.max(
    ...domainStats.map((stat) => stat.count),
    1,
  );

  function chooseDomain(domain: string) {
    setSelectedDomain(domain);
    const firstRecord = baseRecords
      .filter((record) => record.domain === domain)
      .sort((a, b) => b.views - a.views)[0];
    setSelectedId(firstRecord?.id ?? "");
  }

  function chooseRecord(record: DatasetRecord) {
    setSelectedDomain(record.domain);
    setSelectedId(record.id);
  }

  function applyQuickTerm(term: string) {
    const nextRecords = datasets.filter(
      (record) =>
        (activeKind === "전체" || record.kind === activeKind) &&
        matchesQuery(record, term),
    );
    const nextDomain =
      domainOrder.find((domain) =>
        nextRecords.some((record) => record.domain === domain),
      ) ?? selectedDomain;
    setQuery(term);
    setResultQuery("");
    chooseDomain(nextDomain);
  }

  function resetMap() {
    setQuery("");
    setResultQuery("");
    setActiveKind("전체");
    setZoom(1);
    chooseDomain("에너지 수요·생산");
  }

  return (
    <main className="datamap-page">
      <header className="map-header">
        <div className="brand-area">
          <span className="swirl-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <h1>한국지역난방공사 데이터맵</h1>
            <p>공공데이터의 소재지를 알려드립니다.</p>
          </div>
        </div>
        <a
          className="guide-link"
          href="https://www.data.go.kr/"
          target="_blank"
          rel="noreferrer"
        >
          공공데이터포털
        </a>
      </header>

      <section className="map-toolbar" aria-label="데이터맵 도구">
        <button className="home-button" type="button" onClick={resetMap}>
          홈
        </button>
        <label className="main-search">
          <span>데이터맵 검색</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="데이터맵 검색"
          />
          <button type="button" onClick={() => setResultQuery("")}>
            검색
          </button>
        </label>
        <label className="result-search">
          <span>결과 내 검색</span>
          <input
            value={resultQuery}
            onChange={(event) => setResultQuery(event.target.value)}
            placeholder="결과 내 검색"
          />
        </label>
        <div className="toolbar-controls" aria-label="지도 보기">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(value + 0.08, 1.24))}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(value - 0.08, 0.84))}
          >
            -
          </button>
          <button type="button" onClick={resetMap}>
            초기화
          </button>
        </div>
      </section>

      <section className="quick-row" aria-label="추천 검색어">
        <div className="source-tabs" aria-label="제공방식">
          {(["전체", "file", "api"] as const).map((kind) => (
            <button
              className={activeKind === kind ? "active" : ""}
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
            >
              {kind === "전체" ? "전체" : kind === "file" ? "파일데이터" : "오픈API"}
            </button>
          ))}
        </div>
        <div className="term-chips">
          {quickTerms.map((term) => (
            <button key={term} type="button" onClick={() => applyQuickTerm(term)}>
              {term}
            </button>
          ))}
        </div>
      </section>

      <section className="map-board" aria-label="업무 도메인 데이터맵">
        {legendOpen ? (
          <aside className="legend-card">
            <div className="floating-card-title">
              <strong>범례</strong>
              <button type="button" onClick={() => setLegendOpen(false)}>
                닫기
              </button>
            </div>
            <ul>
              {domainStats.map((stat) => (
                <li key={stat.domain} style={toStyle(stat.domain)}>
                  <span aria-hidden="true" />
                  <button type="button" onClick={() => chooseDomain(stat.domain)}>
                    {stat.domain}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : (
          <button
            className="legend-toggle"
            type="button"
            onClick={() => setLegendOpen(true)}
          >
            범례
          </button>
        )}

        <div
          className="map-canvas"
          style={{ "--zoom": zoom } as CSSProperties}
        >
          <div className="orbit" aria-hidden="true" />
          {domainStats.map((stat, index) => {
            const placement = bubblePlacements[stat.domain];
            const size =
              placement.size +
              Math.round((stat.count / maxDomainCount) * 18);
            return (
              <span
                className="orbit-dot"
                aria-hidden="true"
                key={`dot-${stat.domain}`}
                style={toStyle(stat.domain, {
                  "--angle": `${index * 45}deg`,
                })}
              />
            );
          })}
          <button className="center-bubble" type="button" onClick={resetMap}>
            <span>데이터현황</span>
            <strong>{formatNumber(totals.visible)}</strong>
          </button>
          {domainStats.map((stat) => {
            const placement = bubblePlacements[stat.domain];
            const size =
              placement.size +
              Math.round((stat.count / maxDomainCount) * 18);
            return (
              <button
                className={`topic-bubble ${
                  selectedDomain === stat.domain ? "active" : ""
                } ${stat.count === 0 ? "empty" : ""}`}
                key={stat.domain}
                type="button"
                onClick={() => chooseDomain(stat.domain)}
                style={toStyle(stat.domain, {
                  "--x": `${placement.x}%`,
                  "--y": `${placement.y}%`,
                  "--size": `${size}px`,
                })}
              >
                <span>{stat.domain}</span>
                <strong>{stat.count ? formatNumber(stat.count) : "-"}</strong>
              </button>
            );
          })}
        </div>

        <aside className="info-card" style={toStyle(selectedStat.domain)}>
          <div className="info-heading">
            <span>{selectedStat.domain}</span>
            <strong>{formatNumber(selectedStat.count)}</strong>
          </div>
          <p>{domainDescriptions[selectedStat.domain]}</p>
          <div className="info-metrics">
            <span>파일 {formatNumber(selectedStat.fileCount)}</span>
            <span>API {formatNumber(selectedStat.apiCount)}</span>
            <span>조회 {formatNumber(selectedStat.views)}</span>
          </div>
          <div className="keyword-strip">
            {selectedStat.keywords.length ? (
              selectedStat.keywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => applyQuickTerm(keyword)}
                >
                  {keyword}
                </button>
              ))
            ) : (
              <span>키워드 없음</span>
            )}
          </div>

          <div className="related-heading">
            <strong>연관항목</strong>
            <span>{formatNumber(selectedRecords.length)}건</span>
          </div>
          <div className="related-list">
            {selectedRecords.length ? (
              selectedRecords.slice(0, 8).map((record) => (
                <button
                  className={selectedRecord.id === record.id ? "selected" : ""}
                  key={`${record.kind}-${record.id}-${record.title}`}
                  type="button"
                  onClick={() => chooseRecord(record)}
                >
                  <strong>{record.title}</strong>
                  <span>
                    {record.kind === "api" ? "API" : record.format} · 조회{" "}
                    {formatNumber(record.views)}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-state">연관항목이 존재하지 않습니다.</div>
            )}
          </div>

          {selectedRecord ? (
            <section className="record-view">
              <div>
                <span>{selectedRecord.kind === "api" ? "오픈API" : "파일데이터"}</span>
                <h2>{selectedRecord.title}</h2>
              </div>
              <dl>
                <div>
                  <dt>포털 분류</dt>
                  <dd>{selectedRecord.category}</dd>
                </div>
                <div>
                  <dt>시간/공간</dt>
                  <dd>
                    {selectedRecord.timeScale} · {selectedRecord.spaceScale}
                  </dd>
                </div>
                <div>
                  <dt>이용 지표</dt>
                  <dd>
                    조회 {formatNumber(selectedRecord.views)}
                    {selectedRecord.kind === "api"
                      ? ` · 신청 ${formatNumber(selectedRecord.applications)}`
                      : ` · 다운로드 ${formatNumber(selectedRecord.downloads)}`}
                  </dd>
                </div>
              </dl>
              {selectedRecord.url ? (
                <a
                  href={selectedRecord.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  공공데이터포털 열기
                </a>
              ) : null}
            </section>
          ) : null}
        </aside>
      </section>

      <footer className="map-footer">
        <span>
          {sourceSnapshot.organization} · {sourceSnapshot.asOf} 기준
        </span>
        <span>
          파일 {formatNumber(totals.files)} · API {formatNumber(totals.apis)}
        </span>
      </footer>
    </main>
  );
}
