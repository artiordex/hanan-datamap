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
  "설비·자산": { accent: "#b45309", soft: "#fff1d6" },
  "환경·안전": { accent: "#16803f", soft: "#e7f6ec" },
  "지역·공급": { accent: "#be123c", soft: "#ffe4ea" },
  "고객·요금": { accent: "#2563eb", soft: "#e6efff" },
  "경영·행정": { accent: "#5f6472", soft: "#edf0f5" },
  "AI·이미지": { accent: "#7c2d12", soft: "#ffeade" },
  기타: { accent: "#475569", soft: "#edf1f5" },
};

const sortOptions = [
  { value: "views", label: "조회순" },
  { value: "downloads", label: "다운로드순" },
  { value: "applications", label: "신청순" },
  { value: "title", label: "가나다순" },
] as const;

type SortKey = (typeof sortOptions)[number]["value"];
type KindFilter = "전체" | "file" | "api";

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function getDomainStyle(domain: string) {
  return domainStyles[domain] ?? domainStyles.기타;
}

function toStyle(domain: string): CSSProperties {
  const style = getDomainStyle(domain);
  return {
    "--accent": style.accent,
    "--soft": style.soft,
  } as CSSProperties;
}

function score(record: DatasetRecord, sortKey: SortKey) {
  if (sortKey === "title") {
    return 0;
  }
  return record[sortKey];
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

export function DataMapClient() {
  const [query, setQuery] = useState("");
  const [activeDomain, setActiveDomain] = useState("전체");
  const [activeKind, setActiveKind] = useState<KindFilter>("전체");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [selectedId, setSelectedId] = useState(
    () => datasets.toSorted((a, b) => b.views - a.views)[0]?.id ?? "",
  );

  const domainStats = useMemo(() => {
    return domainOrder
      .filter((domain) => datasets.some((record) => record.domain === domain))
      .map((domain) => {
        const records = datasets.filter((record) => record.domain === domain);
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
        };
      });
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return datasets
      .filter((record) => {
        const domainMatch =
          activeDomain === "전체" || record.domain === activeDomain;
        const kindMatch = activeKind === "전체" || record.kind === activeKind;
        const queryMatch =
          normalizedQuery.length === 0 ||
          searchBlob(record).includes(normalizedQuery);
        return domainMatch && kindMatch && queryMatch;
      })
      .toSorted((a, b) => {
        if (sortKey === "title") {
          return a.title.localeCompare(b.title, "ko-KR");
        }
        return score(b, sortKey) - score(a, sortKey);
      });
  }, [activeDomain, activeKind, query, sortKey]);

  const selected =
    datasets.find((record) => record.id === selectedId) ??
    filtered[0] ??
    datasets[0];

  const totals = useMemo(() => {
    const fileCount = datasets.filter((record) => record.kind === "file").length;
    const apiCount = datasets.length - fileCount;
    const csvCount = datasets.filter((record) => record.format === "CSV").length;
    const annualCount = datasets.filter((record) =>
      record.updateCycle.includes("연간"),
    ).length;
    return {
      all: datasets.length,
      fileCount,
      apiCount,
      csvCount,
      annualCount,
      views: datasets.reduce((sum, record) => sum + record.views, 0),
      downloads: datasets.reduce((sum, record) => sum + record.downloads, 0),
      applications: datasets.reduce((sum, record) => sum + record.applications, 0),
    };
  }, []);

  const topRecords = useMemo(
    () => datasets.toSorted((a, b) => b.views - a.views).slice(0, 6),
    [],
  );

  const maxDomainCount = Math.max(
    ...domainStats.map((domain) => domain.count),
    1,
  );

  return (
    <main className="datamap-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <div>
            <p className="eyebrow">{sourceSnapshot.portal}</p>
            <h1>한난 공공데이터맵</h1>
          </div>
        </div>
        <div className="snapshot">
          <span>{sourceSnapshot.asOf} 기준</span>
          <strong>{formatNumber(totals.all)}개 데이터셋</strong>
        </div>
      </header>

      <section className="metric-grid" aria-label="데이터 현황">
        <div className="metric-card">
          <span>전체</span>
          <strong>{formatNumber(totals.all)}</strong>
          <small>파일과 API 통합</small>
        </div>
        <div className="metric-card">
          <span>파일데이터</span>
          <strong>{formatNumber(totals.fileCount)}</strong>
          <small>CSV {formatNumber(totals.csvCount)}건</small>
        </div>
        <div className="metric-card">
          <span>오픈API</span>
          <strong>{formatNumber(totals.apiCount)}</strong>
          <small>REST/XML 제공</small>
        </div>
        <div className="metric-card">
          <span>조회수</span>
          <strong>{formatNumber(totals.views)}</strong>
          <small>상세 목록 합계</small>
        </div>
        <div className="metric-card">
          <span>다운로드</span>
          <strong>{formatNumber(totals.downloads)}</strong>
          <small>파일데이터 기준</small>
        </div>
        <div className="metric-card">
          <span>활용신청</span>
          <strong>{formatNumber(totals.applications)}</strong>
          <small>API 기준</small>
        </div>
      </section>

      <section className="control-band" aria-label="검색과 필터">
        <label className="search-field">
          <span>검색</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="열요금, 온실가스, 지사별, 태양광..."
          />
        </label>
        <label>
          <span>제공방식</span>
          <select
            value={activeKind}
            onChange={(event) => setActiveKind(event.target.value as KindFilter)}
          >
            <option value="전체">전체</option>
            <option value="file">파일</option>
            <option value="api">API</option>
          </select>
        </label>
        <label>
          <span>정렬</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="ghost-button"
          onClick={() => {
            setQuery("");
            setActiveDomain("전체");
            setActiveKind("전체");
            setSortKey("views");
          }}
        >
          초기화
        </button>
      </section>

      <div className="workspace-grid">
        <aside className="domain-panel" aria-label="업무 도메인">
          <button
            className={`domain-button ${activeDomain === "전체" ? "active" : ""}`}
            onClick={() => setActiveDomain("전체")}
          >
            <span>전체 도메인</span>
            <strong>{formatNumber(totals.all)}</strong>
          </button>
          {domainStats.map((stat) => (
            <button
              className={`domain-button ${
                activeDomain === stat.domain ? "active" : ""
              }`}
              key={stat.domain}
              onClick={() => setActiveDomain(stat.domain)}
              style={toStyle(stat.domain)}
            >
              <span>{stat.domain}</span>
              <strong>{formatNumber(stat.count)}</strong>
            </button>
          ))}
        </aside>

        <section className="map-area" aria-label="데이터맵">
          <div className="section-heading">
            <div>
              <p className="eyebrow">업무 도메인 지도</p>
              <h2>데이터가 어느 업무에 붙어 있는지 먼저 보이게</h2>
            </div>
            <span>{formatNumber(filtered.length)}건 표시 중</span>
          </div>

          <div className="domain-lattice">
            {domainStats.map((stat) => {
              const width = Math.max((stat.count / maxDomainCount) * 100, 8);
              return (
                <button
                  className="domain-tile"
                  key={stat.domain}
                  onClick={() => setActiveDomain(stat.domain)}
                  style={toStyle(stat.domain)}
                >
                  <span className="tile-topline">
                    <span className="domain-dot" aria-hidden="true" />
                    {stat.domain}
                  </span>
                  <strong>{formatNumber(stat.count)}</strong>
                  <span className="tile-meta">
                    파일 {formatNumber(stat.fileCount)} · API{" "}
                    {formatNumber(stat.apiCount)}
                  </span>
                  <span className="bar-track" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="content-split">
            <section className="dataset-list" aria-label="데이터셋 목록">
              <div className="list-heading">
                <h2>데이터셋</h2>
                <span>{formatNumber(filtered.length)}건</span>
              </div>
              <div className="rows">
                {filtered.slice(0, 120).map((record) => (
                  <button
                    className={`dataset-row ${
                      selected.id === record.id ? "selected" : ""
                    }`}
                    key={`${record.kind}-${record.id}-${record.title}`}
                    onClick={() => setSelectedId(record.id)}
                    style={toStyle(record.domain)}
                  >
                    <span className="row-main">
                      <span className="kind-pill">
                        {record.kind === "api" ? "API" : record.format}
                      </span>
                      <strong>{record.title}</strong>
                    </span>
                    <span className="row-meta">
                      <span>{record.domain}</span>
                      <span>{record.timeScale}</span>
                      <span>{record.spaceScale}</span>
                    </span>
                    <span className="row-numbers">
                      <span>조회 {formatNumber(record.views)}</span>
                      {record.kind === "file" ? (
                        <span>다운 {formatNumber(record.downloads)}</span>
                      ) : (
                        <span>신청 {formatNumber(record.applications)}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <aside className="detail-panel" aria-label="선택한 데이터셋">
              <div className="detail-header" style={toStyle(selected.domain)}>
                <span>{selected.kind === "api" ? "오픈API" : "파일데이터"}</span>
                <h2>{selected.title}</h2>
              </div>

              <div className="detail-metrics">
                <div>
                  <span>조회</span>
                  <strong>{formatNumber(selected.views)}</strong>
                </div>
                <div>
                  <span>{selected.kind === "api" ? "신청" : "다운로드"}</span>
                  <strong>
                    {formatNumber(
                      selected.kind === "api"
                        ? selected.applications
                        : selected.downloads,
                    )}
                  </strong>
                </div>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>업무 도메인</dt>
                  <dd>{selected.domain}</dd>
                </div>
                <div>
                  <dt>포털 분류</dt>
                  <dd>{selected.category}</dd>
                </div>
                <div>
                  <dt>형식</dt>
                  <dd>{selected.format}</dd>
                </div>
                <div>
                  <dt>갱신</dt>
                  <dd>{selected.updateCycle}</dd>
                </div>
                <div>
                  <dt>시간 단위</dt>
                  <dd>{selected.timeScale}</dd>
                </div>
                <div>
                  <dt>공간 단위</dt>
                  <dd>{selected.spaceScale}</dd>
                </div>
              </dl>

              {selected.description ? (
                <p className="description">{selected.description}</p>
              ) : null}

              <div className="keyword-strip">
                {selected.keywords.slice(0, 8).map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>

              {selected.url ? (
                <a
                  className="primary-link"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  공공데이터포털 열기
                </a>
              ) : null}
            </aside>
          </div>
        </section>

        <aside className="rank-panel" aria-label="인기 데이터">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">조회 상위</p>
              <h2>사용자가 먼저 찾는 데이터</h2>
            </div>
          </div>
          <ol className="rank-list">
            {topRecords.map((record, index) => (
              <li key={`${record.kind}-${record.id}-${record.title}`}>
                <button
                  onClick={() => {
                    setActiveDomain("전체");
                    setSelectedId(record.id);
                  }}
                  style={toStyle(record.domain)}
                >
                  <span>{index + 1}</span>
                  <strong>{record.title}</strong>
                  <small>{formatNumber(record.views)}회</small>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
