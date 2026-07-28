"use client";

import { useMemo, useState } from "react";
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

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function metricFor(record: DatasetRecord) {
  return record.kind === "api" ? record.applications : record.downloads;
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

export function DataMapClient() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [theme, setTheme] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [selectedId, setSelectedId] = useState(datasets[0]?.id ?? "");

  const filtered = useMemo(() => {
    return datasets
      .filter((record) => kind === "all" || record.kind === kind)
      .filter((record) => theme === "all" || record.theme === theme)
      .filter((record) => matches(record, query))
      .sort(compareRecords(sortKey));
  }, [kind, query, sortKey, theme]);

  const selectedRecord =
    filtered.find((record) => record.id === selectedId) ?? filtered[0] ?? datasets[0];

  const visibleSummary = useMemo(() => {
    return {
      total: filtered.length,
      files: filtered.filter((record) => record.kind === "file").length,
      apis: filtered.filter((record) => record.kind === "api").length,
      views: filtered.reduce((sum, record) => sum + record.views, 0),
    };
  }, [filtered]);

  function pickTheme(nextTheme: string) {
    setTheme(nextTheme);
    setSelectedId("");
  }

  function pickKind(nextKind: KindFilter) {
    setKind(nextKind);
    setSelectedId("");
  }

  function resetFilters() {
    setQuery("");
    setKind("all");
    setTheme("all");
    setSortKey("views");
    setSelectedId(datasets[0]?.id ?? "");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{sourceSnapshot.portal}</p>
          <h1>{sourceSnapshot.organization} 공공데이터 JSON</h1>
        </div>
        <a className="json-link" href="/data/hanan-datasets.json" download>
          JSON 내려받기
        </a>
      </header>

      <section className="summary-strip" aria-label="데이터 요약">
        <div>
          <span>전체</span>
          <strong>{formatNumber(dataSummary.total)}</strong>
        </div>
        <div>
          <span>파일</span>
          <strong>{formatNumber(dataSummary.files)}</strong>
        </div>
        <div>
          <span>API</span>
          <strong>{formatNumber(dataSummary.apis)}</strong>
        </div>
        <div>
          <span>조회수</span>
          <strong>{formatNumber(dataSummary.views)}</strong>
        </div>
        <div>
          <span>다운로드</span>
          <strong>{formatNumber(dataSummary.downloads)}</strong>
        </div>
        <div>
          <span>활용신청</span>
          <strong>{formatNumber(dataSummary.applications)}</strong>
        </div>
      </section>

      <section className="workspace" aria-label="데이터 탐색">
        <aside className="sidebar">
          <div className="control-group">
            <label htmlFor="dataset-search">검색</label>
            <input
              id="dataset-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="데이터명, 키워드, 분류체계"
            />
          </div>

          <div className="control-group">
            <span>제공 방식</span>
            <div className="segmented" aria-label="제공 방식">
              {[
                ["all", "전체"],
                ["file", "파일"],
                ["api", "API"],
              ].map(([value, label]) => (
                <button
                  className={kind === value ? "active" : ""}
                  key={value}
                  type="button"
                  onClick={() => pickKind(value as KindFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label htmlFor="theme-select">주제</label>
            <select
              id="theme-select"
              value={theme}
              onChange={(event) => pickTheme(event.target.value)}
            >
              <option value="all">전체 주제</option>
              {themeOrder.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="sort-select">정렬</label>
            <select
              id="sort-select"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="views">조회수 높은 순</option>
              <option value="downloads">다운로드 높은 순</option>
              <option value="applications">활용신청 높은 순</option>
              <option value="name">이름순</option>
            </select>
          </div>

          <button className="reset-button" type="button" onClick={resetFilters}>
            초기화
          </button>

          <div className="theme-list" aria-label="주제별 건수">
            {dataSummary.byTheme.map((item) => (
              <button
                className={theme === item.name ? "active" : ""}
                key={item.name}
                type="button"
                onClick={() => pickTheme(item.name)}
              >
                <span>{item.name}</span>
                <strong>{formatNumber(item.count)}</strong>
              </button>
            ))}
          </div>
        </aside>

        <section className="result-panel" aria-label="검색 결과">
          <div className="result-heading">
            <div>
              <p>검색 결과</p>
              <h2>{formatNumber(visibleSummary.total)}건</h2>
            </div>
            <div className="visible-metrics">
              <span>파일 {formatNumber(visibleSummary.files)}</span>
              <span>API {formatNumber(visibleSummary.apis)}</span>
              <span>조회 {formatNumber(visibleSummary.views)}</span>
            </div>
          </div>

          <div className="dataset-table" role="table" aria-label="데이터셋 목록">
            <div className="table-row table-head" role="row">
              <span role="columnheader">데이터명</span>
              <span role="columnheader">주제</span>
              <span role="columnheader">형식</span>
              <span role="columnheader">조회</span>
              <span role="columnheader">이용</span>
            </div>
            {filtered.slice(0, 160).map((record) => (
              <button
                className={`table-row ${selectedRecord?.id === record.id ? "selected" : ""}`}
                key={record.id}
                type="button"
                role="row"
                onClick={() => setSelectedId(record.id)}
              >
                <span role="cell">
                  <strong>{record.name}</strong>
                  <small>{record.category}</small>
                </span>
                <span role="cell">{record.theme}</span>
                <span role="cell">{record.format}</span>
                <span role="cell">{formatNumber(record.views)}</span>
                <span role="cell">{formatNumber(metricFor(record))}</span>
              </button>
            ))}
          </div>

          {filtered.length > 160 ? (
            <p className="limit-note">
              화면 성능을 위해 상위 160건을 표시했습니다. 검색어를 더 좁히면 나머지 결과를 볼 수 있습니다.
            </p>
          ) : null}
        </section>

        <aside className="detail-panel" aria-label="선택 데이터 상세">
          {selectedRecord ? (
            <>
              <div className="detail-heading">
                <span>{selectedRecord.kind === "api" ? "Open API" : "파일데이터"}</span>
                <h2>{selectedRecord.name}</h2>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>분류체계</dt>
                  <dd>{selectedRecord.category}</dd>
                </div>
                <div>
                  <dt>주제</dt>
                  <dd>{selectedRecord.theme}</dd>
                </div>
                <div>
                  <dt>형식</dt>
                  <dd>{selectedRecord.format}</dd>
                </div>
                <div>
                  <dt>갱신</dt>
                  <dd>{selectedRecord.updateCycle || "-"}</dd>
                </div>
                <div>
                  <dt>기준일</dt>
                  <dd>{selectedRecord.searchDate || sourceSnapshot.asOf}</dd>
                </div>
                <div>
                  <dt>관리부서</dt>
                  <dd>{selectedRecord.department || "-"}</dd>
                </div>
              </dl>

              <div className="detail-metrics">
                <div>
                  <span>조회</span>
                  <strong>{formatNumber(selectedRecord.views)}</strong>
                </div>
                <div>
                  <span>{selectedRecord.kind === "api" ? "활용신청" : "다운로드"}</span>
                  <strong>{formatNumber(metricFor(selectedRecord))}</strong>
                </div>
                <div>
                  <span>행 수</span>
                  <strong>{selectedRecord.rowCount ? formatNumber(selectedRecord.rowCount) : "-"}</strong>
                </div>
              </div>

              {selectedRecord.description ? (
                <p className="description">{selectedRecord.description}</p>
              ) : null}

              <div className="keyword-box">
                {selectedRecord.keywords.length ? (
                  selectedRecord.keywords.slice(0, 12).map((keyword) => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => setQuery(keyword)}
                    >
                      {keyword}
                    </button>
                  ))
                ) : (
                  <span>키워드 없음</span>
                )}
              </div>

              {selectedRecord.url ? (
                <a className="portal-link" href={selectedRecord.url} target="_blank" rel="noreferrer">
                  공공데이터포털 열기
                </a>
              ) : null}
            </>
          ) : (
            <div className="empty-detail">선택된 데이터가 없습니다.</div>
          )}
        </aside>
      </section>
    </main>
  );
}
