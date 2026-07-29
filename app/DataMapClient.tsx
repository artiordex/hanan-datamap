"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  dataSummary,
  datasets,
  sourceSnapshot,
  themeOrder,
  type DatasetKind,
  type DatasetRecord,
} from "./data";

type KindFilter = "all" | DatasetKind;
type SortKey = "views" | "downloads" | "applications" | "name";

type ThemeStyle = {
  accent: string;
  soft: string;
  x: number;
  y: number;
  size: number;
};

type NodePosition = {
  x: number;
  y: number;
};

type DragState = {
  theme: string;
  startX: number;
  startY: number;
  moved: boolean;
};

const themeStyles: Record<string, ThemeStyle> = {
  "에너지·열공급": { accent: "#0f766e", soft: "#e4f7f3", x: 72, y: 48, size: 148 },
  "설비·자산": { accent: "#285ca8", soft: "#e8f0ff", x: 35, y: 26, size: 128 },
  "경영·행정": { accent: "#7c6300", soft: "#f8f0d2", x: 35, y: 78, size: 118 },
  "환경·안전": { accent: "#249b6d", soft: "#e5f8ef", x: 62, y: 20, size: 120 },
  "지역·공간": { accent: "#d6576b", soft: "#ffe8ec", x: 27, y: 56, size: 112 },
  "AI·이미지": { accent: "#7554bd", soft: "#f0eafb", x: 82, y: 28, size: 106 },
  "고객·요금": { accent: "#d26a21", soft: "#fff0e5", x: 64, y: 78, size: 106 },
  기타: { accent: "#7b8794", soft: "#eef1f5", x: 50, y: 12, size: 96 },
};

const themeDescriptions: Record<string, string> = {
  "에너지·열공급":
    "연료사용량, 발전·전력 생산, 열판매량, 난방지수처럼 열과 에너지 흐름을 파악하는 데이터입니다.",
  "설비·자산":
    "열수송관, 밸브, 맨홀, 시설 운영, 자재와 준공 정보처럼 물리 설비와 자산 관리에 가까운 데이터입니다.",
  "경영·행정":
    "입찰, 계약, 조직, 제도, 연구, 교육, 공시처럼 기관 운영과 행정 업무를 설명하는 데이터입니다.",
  "환경·안전":
    "온실가스, 기상, 환경 인증, 안전 점검과 사고 예방처럼 환경·안전 판단에 쓰이는 데이터입니다.",
  "지역·공간":
    "지사별·지역별 현황, 위치와 권역처럼 공간 단위로 데이터를 바라볼 때 유용한 묶음입니다.",
  "AI·이미지":
    "이미지·영상 학습 데이터와 시각 분석에 가까운 자료를 모았습니다.",
  "고객·요금":
    "요금, 고객, 계량기, 사용자 설비처럼 실제 이용자와 서비스 운영에 연결되는 데이터입니다.",
  기타: "주요 주제 규칙에 바로 묶이지 않는 보조 데이터입니다.",
};

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function metricFor(record: DatasetRecord) {
  return record.kind === "api" ? record.applications : record.downloads;
}

function metricLabel(record: DatasetRecord) {
  return record.kind === "api" ? "활용신청" : "다운로드";
}

function searchText(record: DatasetRecord) {
  return [
    record.name,
    record.originalName,
    record.theme,
    record.category,
    record.categoryGroup,
    record.format,
    record.updateCycle,
    record.department,
    record.description,
    ...record.keywords,
  ]
    .join(" ")
    .toLowerCase();
}

function matches(record: DatasetRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  return !normalized || searchText(record).includes(normalized);
}

function compareRecords(sortKey: SortKey) {
  return (a: DatasetRecord, b: DatasetRecord) => {
    if (sortKey === "name") {
      return a.name.localeCompare(b.name, "ko-KR");
    }

    const left =
      sortKey === "downloads"
        ? a.downloads
        : sortKey === "applications"
          ? a.applications
          : a.views;
    const right =
      sortKey === "downloads"
        ? b.downloads
        : sortKey === "applications"
          ? b.applications
          : b.views;

    return right - left || a.name.localeCompare(b.name, "ko-KR");
  };
}

function styleFor(theme: string, extra?: Record<string, string | number>) {
  const style = themeStyles[theme] ?? themeStyles.기타;
  return {
    "--accent": style.accent,
    "--soft": style.soft,
    "--x": `${style.x}%`,
    "--y": `${style.y}%`,
    "--base-size": `${style.size}px`,
    ...extra,
  } as CSSProperties;
}

function topKeywords(records: DatasetRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const keyword of record.keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))
    .slice(0, 6)
    .map(([keyword]) => keyword);
}

function clampPercent(value: number) {
  return Math.min(92, Math.max(8, value));
}

export function DataMapClient() {
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<KindFilter>("all");
  const [selectedTheme, setSelectedTheme] = useState(themeOrder[0] ?? "에너지·열공급");
  const [selectedId, setSelectedId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [legendOpen, setLegendOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const draggedThemes = useRef(new Set<string>());

  const baseRecords = useMemo(() => {
    return datasets.filter((record) => {
      const kindMatch = activeKind === "all" || record.kind === activeKind;
      return kindMatch && matches(record, query);
    });
  }, [activeKind, query]);

  const themeStats = useMemo(() => {
    return themeOrder.map((theme) => {
      const records = baseRecords.filter((record) => record.theme === theme);
      return {
        theme,
        count: records.length,
        files: records.filter((record) => record.kind === "file").length,
        apis: records.filter((record) => record.kind === "api").length,
        views: records.reduce((sum, record) => sum + record.views, 0),
        downloads: records.reduce((sum, record) => sum + record.downloads, 0),
        applications: records.reduce((sum, record) => sum + record.applications, 0),
        keywords: topKeywords(records),
      };
    });
  }, [baseRecords]);

  const selectedStat =
    themeStats.find((stat) => stat.theme === selectedTheme && stat.count > 0) ??
    themeStats.find((stat) => stat.count > 0) ??
    themeStats[0];

  const selectedRecords = useMemo(() => {
    return baseRecords
      .filter((record) => record.theme === selectedStat?.theme)
      .sort(compareRecords(sortKey));
  }, [baseRecords, selectedStat?.theme, sortKey]);

  const selectedRecord =
    selectedRecords.find((record) => record.id === selectedId) ??
    selectedRecords[0] ??
    baseRecords[0] ??
    datasets[0];

  const visibleTotals = useMemo(() => {
    return {
      total: baseRecords.length,
      files: baseRecords.filter((record) => record.kind === "file").length,
      apis: baseRecords.filter((record) => record.kind === "api").length,
      views: baseRecords.reduce((sum, record) => sum + record.views, 0),
    };
  }, [baseRecords]);

  const maxThemeCount = Math.max(...themeStats.map((stat) => stat.count), 1);
  const quickTerms = dataSummary.topKeywords.slice(0, 8).map((item) => item.name);

  function chooseTheme(theme: string) {
    setSelectedTheme(theme);
    const firstRecord = baseRecords
      .filter((record) => record.theme === theme)
      .sort(compareRecords(sortKey))[0];
    setSelectedId(firstRecord?.id ?? "");
  }

  function nodeStyle(theme: string, extra?: Record<string, string | number>) {
    const position = nodePositions[theme];
    return styleFor(theme, {
      ...(position
        ? {
            "--x": `${position.x}%`,
            "--y": `${position.y}%`,
          }
        : {}),
      ...extra,
    });
  }

  function beginNodeDrag(theme: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      theme,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    });
  }

  function dragNode(theme: string, event: PointerEvent<HTMLButtonElement>) {
    if (dragState?.theme !== theme) return;

    const canvas = event.currentTarget.parentElement;
    const rect = canvas?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const moved =
      dragState.moved ||
      Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4;

    if (moved) draggedThemes.current.add(theme);

    setDragState((current) =>
      current?.theme === theme
        ? {
            ...current,
            moved,
          }
        : current,
    );
    setNodePositions((current) => ({
      ...current,
      [theme]: {
        x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
        y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
      },
    }));
  }

  function endNodeDrag(theme: string, event: PointerEvent<HTMLButtonElement>) {
    if (dragState?.theme !== theme) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  function selectThemeFromNode(theme: string) {
    if (draggedThemes.current.has(theme)) {
      draggedThemes.current.delete(theme);
      return;
    }

    chooseTheme(theme);
  }

  function chooseRecord(record: DatasetRecord) {
    setSelectedTheme(record.theme);
    setSelectedId(record.id);
  }

  function applyTerm(term: string) {
    const nextRecords = datasets.filter(
      (record) =>
        (activeKind === "all" || record.kind === activeKind) && matches(record, term),
    );
    const nextTheme =
      themeOrder.find((theme) => nextRecords.some((record) => record.theme === theme)) ??
      selectedTheme;

    setQuery(term);
    setSelectedTheme(nextTheme);
    setSelectedId("");
  }

  function resetMap() {
    setQuery("");
    setActiveKind("all");
    setSelectedTheme(themeOrder[0] ?? "에너지·열공급");
    setSelectedId(datasets[0]?.id ?? "");
    setSortKey("views");
    setZoom(1);
    setNodePositions({});
  }

  return (
    <main className="datamap-page">
      <header className="map-header">
        <div className="brand-area">
          <span className="swirl-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <p>{sourceSnapshot.portal}</p>
            <h1>{sourceSnapshot.organization} 공공데이터맵</h1>
          </div>
        </div>
        <a className="json-link" href="/data/hanan-datasets.json" download>
          JSON 내려받기
        </a>
      </header>

      <section className="map-toolbar" aria-label="데이터맵 도구">
        <button className="home-button" type="button" onClick={resetMap}>
          전체
        </button>

        <label className="main-search">
          <span>데이터 검색</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="데이터명, 키워드, 분류체계 검색"
          />
        </label>

        <div className="source-tabs" aria-label="제공 방식">
          {[
            ["all", "전체"],
            ["file", "파일"],
            ["api", "API"],
          ].map(([value, label]) => (
            <button
              className={activeKind === value ? "active" : ""}
              key={value}
              type="button"
              onClick={() => {
                setActiveKind(value as KindFilter);
                setSelectedId("");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="sort-select">
          <span>정렬</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            <option value="views">조회수</option>
            <option value="downloads">다운로드</option>
            <option value="applications">활용신청</option>
            <option value="name">이름순</option>
          </select>
        </label>

        <div className="toolbar-controls" aria-label="지도 확대">
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
        </div>
      </section>

      <section className="quick-row" aria-label="추천 검색어">
        <div className="summary-pills">
          <span>전체 {formatNumber(dataSummary.total)}</span>
          <span>파일 {formatNumber(dataSummary.files)}</span>
          <span>API {formatNumber(dataSummary.apis)}</span>
          <span>조회 {formatNumber(visibleTotals.views)}</span>
        </div>
        <div className="term-chips">
          {quickTerms.map((term) => (
            <button key={term} type="button" onClick={() => applyTerm(term)}>
              {term}
            </button>
          ))}
        </div>
      </section>

      <section className="map-board" aria-label="주제별 공공데이터맵">
        {legendOpen ? (
          <aside className="legend-card">
            <div className="floating-card-title">
              <strong>범례</strong>
              <button type="button" onClick={() => setLegendOpen(false)}>
                닫기
              </button>
            </div>
            <ul>
              {themeStats.map((stat) => (
                <li key={stat.theme} style={styleFor(stat.theme)}>
                  <span aria-hidden="true" />
                  <button type="button" onClick={() => chooseTheme(stat.theme)}>
                    {stat.theme}
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

        <div className="map-canvas" style={{ "--zoom": zoom } as CSSProperties}>
          <div className="orbit" aria-hidden="true" />
          {themeStats.map((stat, index) => (
            <span
              className="orbit-dot"
              aria-hidden="true"
              key={`dot-${stat.theme}`}
              style={styleFor(stat.theme, { "--angle": `${index * 51}deg` })}
            />
          ))}

          <button className="center-bubble" type="button" onClick={resetMap}>
            <span>데이터 현황</span>
            <strong>{formatNumber(visibleTotals.total)}</strong>
          </button>

          {themeStats.map((stat) => {
            const sizeBoost = Math.round((stat.count / maxThemeCount) * 24);
            return (
              <button
                className={`topic-bubble ${
                  selectedStat?.theme === stat.theme ? "active" : ""
                } ${stat.count === 0 ? "empty" : ""}`}
                key={stat.theme}
                type="button"
                onClick={() => selectThemeFromNode(stat.theme)}
                onPointerDown={(event) => beginNodeDrag(stat.theme, event)}
                onPointerMove={(event) => dragNode(stat.theme, event)}
                onPointerUp={(event) => endNodeDrag(stat.theme, event)}
                onPointerCancel={(event) => endNodeDrag(stat.theme, event)}
                style={nodeStyle(stat.theme, {
                  "--size": `calc(var(--base-size) + ${sizeBoost}px)`,
                })}
              >
                <span>{stat.theme}</span>
                <strong>{stat.count ? formatNumber(stat.count) : "-"}</strong>
              </button>
            );
          })}
        </div>

        <aside className="info-card" style={styleFor(selectedStat?.theme ?? "기타")}>
          <div className="info-heading">
            <span>{selectedStat?.theme ?? "데이터"}</span>
            <strong>{formatNumber(selectedStat?.count ?? 0)}</strong>
          </div>
          <p>{themeDescriptions[selectedStat?.theme ?? "기타"]}</p>

          <div className="info-metrics">
            <span>파일 {formatNumber(selectedStat?.files ?? 0)}</span>
            <span>API {formatNumber(selectedStat?.apis ?? 0)}</span>
            <span>조회 {formatNumber(selectedStat?.views ?? 0)}</span>
            <span>다운로드 {formatNumber(selectedStat?.downloads ?? 0)}</span>
          </div>

          <div className="keyword-strip">
            {selectedStat?.keywords.length ? (
              selectedStat.keywords.map((keyword) => (
                <button key={keyword} type="button" onClick={() => applyTerm(keyword)}>
                  {keyword}
                </button>
              ))
            ) : (
              <span>키워드 없음</span>
            )}
          </div>

          <div className="related-heading">
            <strong>관련 데이터</strong>
            <span>{formatNumber(selectedRecords.length)}건</span>
          </div>

          <div className="related-list">
            {selectedRecords.length ? (
              selectedRecords.slice(0, 9).map((record) => (
                <button
                  className={selectedRecord?.id === record.id ? "selected" : ""}
                  key={record.id}
                  type="button"
                  onClick={() => chooseRecord(record)}
                >
                  <strong>{record.name}</strong>
                  <span>
                    {record.kind === "api" ? "API" : record.format} · 조회{" "}
                    {formatNumber(record.views)}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-state">조건에 맞는 데이터가 없습니다.</div>
            )}
          </div>

          {selectedRecord ? (
            <section className="record-view">
              <div>
                <span>{selectedRecord.kind === "api" ? "Open API" : "파일데이터"}</span>
                <h2>{selectedRecord.name}</h2>
              </div>

              <dl>
                <div>
                  <dt>분류체계</dt>
                  <dd>{selectedRecord.category}</dd>
                </div>
                <div>
                  <dt>형식</dt>
                  <dd>{selectedRecord.format}</dd>
                </div>
                <div>
                  <dt>갱신주기</dt>
                  <dd>{selectedRecord.updateCycle || "-"}</dd>
                </div>
                <div>
                  <dt>{metricLabel(selectedRecord)}</dt>
                  <dd>{formatNumber(metricFor(selectedRecord))}</dd>
                </div>
              </dl>

              {selectedRecord.description ? (
                <p>{selectedRecord.description}</p>
              ) : null}

              {selectedRecord.url ? (
                <a href={selectedRecord.url} target="_blank" rel="noreferrer">
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
          현재 표시 {formatNumber(visibleTotals.total)}건 · 파일{" "}
          {formatNumber(visibleTotals.files)} · API {formatNumber(visibleTotals.apis)}
        </span>
      </footer>
    </main>
  );
}
