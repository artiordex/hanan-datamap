import * as d3 from "d3";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type KindFilter = "all" | DatasetKind;
type SortKey = "views" | "downloads" | "applications" | "name";

type DatasetKind = "file" | "api";
type RecordViewMode = "network" | "list";

type NamedCount = {
  name: string;
  count: number;
};

type DatasetRecord = {
  id: string;
  sourceId: string;
  fileId?: string;
  apiId?: string;
  kind: DatasetKind;
  name: string;
  originalName: string;
  slug: string;
  theme: string;
  category: string;
  categoryGroup: string;
  categoryFull: string;
  categoryLevel1: string;
  categoryLevel2: string;
  provider: string;
  department: string;
  departmentPhone: string;
  searchDate: string;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
  nextUpdateAt: string;
  firstRegisteredAt: string;
  updateCycle: string;
  mediaType: string;
  extension: string;
  format: string;
  rowCount: number;
  views: number;
  downloads: number;
  cumulativeDownloads: number;
  applications: number;
  keywords: string[];
  provisionType: string;
  description: string;
  limitations: string;
  notes: string;
  legalBasis?: string;
  collectionMethod?: string;
  apiType?: string;
  dataFormat?: string;
  isCharged?: string;
  traffic?: string;
  reviewType?: string;
  license?: string;
  referenceDocument?: string;
};

type DataCatalog = {
  source: {
    organization: string;
    portal: string;
    asOf: string;
    generatedAt: string;
    workbooks: Array<{ role: string; fileName: string }>;
  };
  datasets: DatasetRecord[];
};

const catalogUrl = "/data/hanan-datasets.json";
const emptySource: DataCatalog["source"] = {
  organization: "한국지역난방공사",
  portal: "data.go.kr",
  asOf: "-",
  generatedAt: "",
  workbooks: [],
};

type CatalogSummary = {
  total: number;
  files: number;
  apis: number;
  views: number;
  downloads: number;
  cumulativeDownloads: number;
  applications: number;
  byTheme: NamedCount[];
  byCategoryGroup: NamedCount[];
  byFormat: NamedCount[];
  topKeywords: NamedCount[];
};

type ThemeStat = {
  theme: string;
  count: number;
  files: number;
  apis: number;
  views: number;
  downloads: number;
  applications: number;
  keywords: string[];
  color: string;
};

type RecordSummary = Pick<
  ThemeStat,
  "count" | "files" | "apis" | "views" | "downloads" | "applications" | "keywords"
>;

type GraphNodeKind = "center" | "level1" | "level2" | "record";

type GraphItem = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  countLabel: string;
  color: string;
  radius: number;
  tooltip?: string;
  parentId?: string;
  isEmpty?: boolean;
  theme?: string;
  categoryLevel2?: string;
  recordId?: string;
};

type GraphControls = {
  fitAll: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  countLabel: string;
  color: string;
  radius: number;
  kind: GraphNodeKind;
  tooltip?: string;
  parentId?: string;
  targetX: number;
  targetY: number;
  angle: number;
  theme?: string;
  categoryLevel2?: string;
  recordId?: string;
  isCenter?: boolean;
  isEmpty?: boolean;
  labelLane?: number;
};

type GraphLink = {
  source: string;
  target: string;
  isEmpty?: boolean;
};

type IconName =
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "chevronUp"
  | "chevronsLeft"
  | "chevronsRight"
  | "fitView"
  | "help"
  | "home"
  | "minus"
  | "plus"
  | "rotateCcw"
  | "search"
  | "x";

const palette = [
  "#3b82f6",
  "#8b5cf6",
  "#059669",
  "#f97316",
  "#4338ca",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#ef4444",
  "#06b6d4",
  "#7c3aed",
  "#64748b",
];

const centerNodeColor = "#111827";
const branchNodeRadius = 50;
const level2NodeRadius = Math.round(branchNodeRadius * (2 / 3));
const recordDotRadius = 5;

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function dataGoKrUrl(record: DatasetRecord) {
  const dataId = record.kind === "api" ? record.apiId : record.fileId;
  const page = record.kind === "api" ? "openapi.do" : "fileData.do";
  return dataId ? `https://www.data.go.kr/data/${dataId}/${page}` : "";
}

function kindDisplay(record: DatasetRecord) {
  return record.kind === "api" ? "Open API" : "파일 데이터";
}

function formatRecordValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "-";
  if (typeof value === "number") return formatNumber(value);
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function normalizeInfoRows(rows: Array<{ label: string; value: unknown }>) {
  return rows
    .map((row) => ({ ...row, value: formatRecordValue(row.value) }))
    .filter((row) => row.value !== "-");
}

function recordInfoRows(record: DatasetRecord) {
  return normalizeInfoRows([
    { label: "데이터명", value: record.name },
    { label: "데이터유형", value: kindDisplay(record) },
    ...(record.kind === "file" ? [{ label: "파일아이디", value: record.fileId }] : []),
    { label: "제공기관", value: record.provider },
    { label: "등록일", value: record.registeredAt },
    { label: "1차분류", value: level1Label(record) },
    { label: "2차분류", value: level2Label(record) },
    { label: "확장자", value: record.extension || record.format },
    { label: "갱신주기", value: record.updateCycle },
    { label: "행 수", value: record.rowCount },
    { label: "키워드", value: record.keywords },
    { label: "설명", value: record.description },
    { label: "제약사항", value: record.limitations },
    { label: "비고", value: record.notes },
    { label: "법적근거", value: record.legalBasis },
    { label: "수집방법", value: record.collectionMethod },
    { label: "API유형", value: record.apiType },
    { label: "유무료", value: record.isCharged },
    { label: "트래픽", value: record.traffic },
    { label: "심의유형", value: record.reviewType },
    { label: "라이선스", value: record.license },
    { label: "참고문서", value: record.referenceDocument },
  ]);
}

function level1Label(record: DatasetRecord) {
  return record.categoryLevel1 || record.theme || "기타";
}

function level2Label(record: DatasetRecord) {
  return record.categoryLevel2 || record.categoryFull || "기타";
}

function extensionLabel(record: DatasetRecord) {
  return record.extension || record.format || "기타";
}

function level1NodeId(theme: string) {
  return `level1-${theme}`;
}

function level2NodeId(theme: string, category: string) {
  return `level2-${theme}-${category}`;
}

function dataMapSearchText(record: DatasetRecord) {
  return [
    record.name,
    record.description,
    ...record.keywords,
  ]
    .join(" ")
    .toLowerCase();
}

function detailSearchText(record: DatasetRecord) {
  return [
    record.name,
    record.originalName,
    record.theme,
    record.category,
    record.categoryGroup,
    record.categoryFull,
    record.categoryLevel1,
    record.categoryLevel2,
    record.format,
    record.extension,
    record.updateCycle,
    record.department,
    record.description,
    record.registeredAt,
    record.updatedAt,
    record.sourceId,
    record.fileId,
    record.apiId,
    ...record.keywords,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesText(record: DatasetRecord, query: string, getText: (record: DatasetRecord) => string) {
  const normalized = query.trim().toLowerCase();
  return !normalized || getText(record).includes(normalized);
}

function matchesDataMapSearch(record: DatasetRecord, query: string) {
  return matchesText(record, query, dataMapSearchText);
}

function matchesDetailSearch(record: DatasetRecord, query: string) {
  return matchesText(record, query, detailSearchText);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightParts(value: string, query: string) {
  const term = query.trim();
  if (!term) return [{ text: value, isMatch: false }];

  const matcher = new RegExp(`(${escapeRegExp(term)})`, "gi");
  const normalizedTerm = term.toLowerCase();

  return value
    .split(matcher)
    .filter((part) => part !== "")
    .map((part) => ({
      text: part,
      isMatch: part.toLowerCase() === normalizedTerm,
    }));
}

function highlightSearchTerm(value: string, query: string) {
  return highlightParts(value, query).map((part, index) =>
    part.isMatch ? (
      <mark className="search-highlight" key={`${part.text}-${index}`}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return hash >>> 0;
}

function shuffledKeywords(records: DatasetRecord[], seed: string) {
  return keywordCounts(records, 120)
    .map(({ name }) => name)
    .sort(
      (keywordA, keywordB) =>
        hashText(`${seed}-${keywordA}`) - hashText(`${seed}-${keywordB}`) ||
        keywordA.localeCompare(keywordB, "ko-KR"),
    );
}

function compareRecords(sortKey: SortKey) {
  return (a: DatasetRecord, b: DatasetRecord) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "ko-KR");

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

function countBy(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value.trim() || "기타";
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB, "ko-KR"))
    .map(([name, count]) => ({ name, count }));
}

function keywordCounts(records: DatasetRecord[], limit: number) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const keyword of record.keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function topKeywords(records: DatasetRecord[]) {
  return keywordCounts(records, 6)
    .map(({ name }) => name);
}

function summarizeCatalog(records: DatasetRecord[]): CatalogSummary {
  return {
    total: records.length,
    files: records.filter((record) => record.kind === "file").length,
    apis: records.filter((record) => record.kind === "api").length,
    views: records.reduce((sum, record) => sum + record.views, 0),
    downloads: records.reduce((sum, record) => sum + record.downloads, 0),
    cumulativeDownloads: records.reduce(
      (sum, record) => sum + record.cumulativeDownloads,
      0,
    ),
    applications: records.reduce((sum, record) => sum + record.applications, 0),
    byTheme: countBy(records.map(level1Label)),
    byCategoryGroup: countBy(records.map(level2Label)),
    byFormat: countBy(
      records.map((record) => record.extension || record.format || "기타"),
    ),
    topKeywords: keywordCounts(records, 30),
  };
}

function summarizeRecords(records: DatasetRecord[]): RecordSummary {
  return {
    count: records.length,
    files: records.filter((record) => record.kind === "file").length,
    apis: records.filter((record) => record.kind === "api").length,
    views: records.reduce((sum, record) => sum + record.views, 0),
    downloads: records.reduce((sum, record) => sum + record.downloads, 0),
    applications: records.reduce((sum, record) => sum + record.applications, 0),
    keywords: topKeywords(records),
  };
}

function summaryTooltip(label: string, summary: RecordSummary) {
  return [
    label,
    `데이터 ${formatNumber(summary.count)}건`,
    `파일 ${formatNumber(summary.files)} · API ${formatNumber(summary.apis)}`,
    summary.keywords.length ? `대표 키워드 ${summary.keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function recordTooltip(record: DatasetRecord) {
  return [
    record.name,
    kindDisplay(record),
    `${level1Label(record)} > ${level2Label(record)}`,
    `확장자 ${extensionLabel(record)}`,
    record.keywords.length ? `키워드 ${record.keywords.slice(0, 6).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function shortLabel(label: string, max = 12) {
  return label.length > max ? `${label.slice(0, max - 1)}...` : label;
}

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const iconProps = {
    "aria-hidden": true,
    className: "ui-icon",
    fill: "none",
    focusable: false,
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.2,
    viewBox: "0 0 24 24",
    width: size,
  };

  switch (name) {
    case "chevronDown":
      return (
        <svg {...iconProps}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chevronLeft":
      return (
        <svg {...iconProps}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg {...iconProps}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case "chevronUp":
      return (
        <svg {...iconProps}>
          <path d="m18 15-6-6-6 6" />
        </svg>
      );
    case "chevronsLeft":
      return (
        <svg {...iconProps}>
          <path d="m11 17-5-5 5-5" />
          <path d="m18 17-5-5 5-5" />
        </svg>
      );
    case "chevronsRight":
      return (
        <svg {...iconProps}>
          <path d="m6 17 5-5-5-5" />
          <path d="m13 17 5-5-5-5" />
        </svg>
      );
    case "fitView":
      return (
        <svg {...iconProps}>
          <path d="M8 4H4v4" />
          <path d="m4 4 6 6" />
          <path d="M16 4h4v4" />
          <path d="m20 4-6 6" />
          <path d="M4 16v4h4" />
          <path d="m4 20 6-6" />
          <path d="M20 16v4h-4" />
          <path d="m20 20-6-6" />
        </svg>
      );
    case "help":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.75 9a2.35 2.35 0 0 1 4.5 1c0 1.5-1.5 2-2.25 2.75" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "home":
      return (
        <svg {...iconProps}>
          <path d="m3 10.5 9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "minus":
      return (
        <svg {...iconProps}>
          <path d="M5 12h14" />
        </svg>
      );
    case "plus":
      return (
        <svg {...iconProps}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "rotateCcw":
      return (
        <svg {...iconProps}>
          <path d="M3 7v6h6" />
          <path d="M3 13a8 8 0 1 0 2.34-5.66L3 9.68" />
        </svg>
      );
    case "search":
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "x":
      return (
        <svg {...iconProps}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
  }
}

function NetworkGraph({
  center,
  items,
  labelHighlightTerm,
  onNodeClick,
  registerControls,
  selectedNodeId,
}: {
  center: GraphItem;
  items: GraphItem[];
  labelHighlightTerm: string;
  onNodeClick: (item: GraphItem) => void;
  registerControls: (controls: GraphControls | null) => void;
  selectedNodeId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphOffsetRef = useRef({ x: 0, y: 0 });
  const labelHighlightTermRef = useRef(labelHighlightTerm);
  const movedRecordPositionsRef = useRef(new Map<string, { angle: number; x: number; y: number }>());
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement || size.width <= 0 || size.height <= 0) return;

    const width = size.width;
    const height = size.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const graphOffset = graphOffsetRef.current;
    const graphCenterX = centerX + graphOffset.x;
    const graphCenterY = centerY + graphOffset.y;
    const orbitRadius = Math.min(width, height) * 0.32;
    const level1Radius = Math.min(Math.max(orbitRadius * 0.98, 174), 250);
    const level2Radius = level1Radius * 1.9;
    const recordRadius = level2Radius + Math.min(Math.max(level1Radius * 0.72, 105), 150);
    const compactRecordAngleStep = 24 / Math.max(recordRadius, 1);
    const level1Items = items.filter((item) => item.kind === "level1");
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const level2ItemsByParent = new Map<string, GraphItem[]>();
    const recordItemsByParent = new Map<string, GraphItem[]>();

    for (const item of items) {
      if (!item.parentId) continue;

      if (item.kind === "level2") {
        const group = level2ItemsByParent.get(item.parentId) ?? [];
        group.push(item);
        level2ItemsByParent.set(item.parentId, group);
      }

      if (item.kind === "record") {
        const group = recordItemsByParent.get(item.parentId) ?? [];
        group.push(item);
        recordItemsByParent.set(item.parentId, group);
      }
    }

    const angleById = new Map<string, number>();
    const spreadAngle = (
      parentAngle: number,
      index: number,
      total: number,
      maxSpread: number,
      density = 0.22,
    ) => {
      if (total <= 1) return parentAngle;
      const spread = Math.min(maxSpread, total * density);
      return parentAngle + (index - (total - 1) / 2) * (spread / (total - 1));
    };
    const angleForItem = (item: GraphItem): number => {
      const cached = angleById.get(item.id);
      if (cached !== undefined) return cached;

      if (item.kind === "level1") {
        const index = Math.max(
          level1Items.findIndex((level1Item) => level1Item.id === item.id),
          0,
        );
        const angle =
          -Math.PI / 2 + (index / Math.max(level1Items.length, 1)) * Math.PI * 2;
        angleById.set(item.id, angle);
        return angle;
      }

      if (item.kind === "level2" && item.parentId) {
        const parent = itemsById.get(item.parentId);
        const parentAngle = parent ? angleForItem(parent) : -Math.PI / 2;
        const siblings = level2ItemsByParent.get(item.parentId) ?? [item];
        const index = Math.max(
          siblings.findIndex((sibling) => sibling.id === item.id),
          0,
        );
        const angle = spreadAngle(parentAngle, index, siblings.length, Math.PI * 0.95);
        angleById.set(item.id, angle);
        return angle;
      }

      if (item.kind === "record" && item.parentId) {
        const parent = itemsById.get(item.parentId);
        const parentAngle = parent ? angleForItem(parent) : -Math.PI / 2;
        const siblings = recordItemsByParent.get(item.parentId) ?? [item];
        const index = Math.max(
          siblings.findIndex((sibling) => sibling.id === item.id),
          0,
        );
        const angle =
          parentAngle + (index - (siblings.length - 1) / 2) * compactRecordAngleStep;
        angleById.set(item.id, angle);
        return angle;
      }

      return -Math.PI / 2;
    };
    const targetForItem = (item: GraphItem) => {
      const angle = angleForItem(item);
      const radius =
        item.kind === "record"
          ? recordRadius
          : item.kind === "level2"
            ? level2Radius
            : level1Radius;

      return {
        x: graphCenterX + Math.cos(angle) * radius,
        y: graphCenterY + Math.sin(angle) * radius,
        angle,
      };
    };

    const graphNodes: GraphNode[] = [
      {
        id: "__center",
        label: center.label,
        countLabel: center.countLabel,
        color: center.color,
        radius: center.radius,
        kind: "center",
        isCenter: true,
        x: graphCenterX,
        y: graphCenterY,
        targetX: graphCenterX,
        targetY: graphCenterY,
        angle: 0,
      },
      ...items.map((item) => {
        const target = targetForItem(item);
        const movedPosition =
          item.kind === "record" ? movedRecordPositionsRef.current.get(item.id) : undefined;
        const x = movedPosition?.x ?? target.x;
        const y = movedPosition?.y ?? target.y;
        const angle = movedPosition?.angle ?? target.angle;

        return {
          id: item.id,
          label: item.label,
          countLabel: item.countLabel,
          color: item.color,
          radius: item.radius,
          kind: item.kind,
          tooltip: item.tooltip,
          parentId: item.parentId,
          targetX: x,
          targetY: y,
          angle,
          theme: item.theme,
          categoryLevel2: item.categoryLevel2,
          recordId: item.recordId,
          isEmpty: item.isEmpty,
          x,
          y,
        };
      }),
    ];
    const visibleRecordIds = new Set(
      items.filter((item) => item.kind === "record").map((item) => item.id),
    );
    for (const recordId of movedRecordPositionsRef.current.keys()) {
      if (!visibleRecordIds.has(recordId)) movedRecordPositionsRef.current.delete(recordId);
    }

    const recordsByParent = new Map<string, GraphNode[]>();
    for (const graphNode of graphNodes) {
      if (graphNode.kind !== "record" || !graphNode.parentId) continue;
      const group = recordsByParent.get(graphNode.parentId) ?? [];
      group.push(graphNode);
      recordsByParent.set(graphNode.parentId, group);
    }

    const labelLanePattern = [0, -1, 1, -2, 2, -3, 3];
    for (const records of recordsByParent.values()) {
      const lastArcByLane = new Map<number, number>();
      records
        .sort((recordA, recordB) => recordA.angle - recordB.angle)
        .forEach((record) => {
          const arcPosition = record.angle * recordRadius;
          const lane =
            labelLanePattern.find((candidate) => {
              const lastArc = lastArcByLane.get(candidate);
              return lastArc === undefined || arcPosition - lastArc >= 22;
            }) ?? 0;
          record.labelLane = lane;
          lastArcByLane.set(lane, arcPosition);
        });
    }

    const graphLinks: GraphLink[] = items.map((item) => ({
      source: item.parentId ?? "__center",
      target: item.id,
      isEmpty: item.isEmpty,
    }));

    const svg = d3
      .select(svgElement)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    svg.selectAll("*").remove();

    const layer = svg.append("g").attr("class", "d3-graph-layer");

    const link = layer
      .append("g")
      .attr("class", "d3-links")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(graphLinks)
      .join("line")
      .attr("class", (d) => `d3-link${d.isEmpty ? " empty" : ""}`);

    const node = layer
      .append("g")
      .attr("class", "d3-nodes")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(graphNodes)
      .join("g")
      .attr("class", (d) =>
        [
          "d3-node",
          d.kind,
          d.isCenter ? "center" : "",
          d.isEmpty ? "empty" : "",
        ]
          .filter(Boolean)
          .join(" "),
      );

    node.append("title").text((d) => d.tooltip || `${d.label}\n${d.countLabel}`);

    node
      .filter((d) => d.kind === "record")
      .append("circle")
      .attr("class", "d3-record-hit")
      .attr("r", 18)
      .attr("fill", "transparent");

    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color);

    const bubbleNode = node.filter((d) => d.kind !== "record");
    const recordNode = node.filter((d) => d.kind === "record");
    let draggedRecordId = "";
    const isDraggedRecord = (d: GraphNode) => d.kind === "record" && d.id === draggedRecordId;
    const isFlippedRecordLabel = (d: GraphNode) => {
      const angle = (d.angle * 180) / Math.PI;
      return angle > 90 || angle < -90;
    };
    const recordLabelRotation = (d: GraphNode) => {
      if (isDraggedRecord(d)) return 0;
      const angle = (d.angle * 180) / Math.PI;
      return angle > 90 || angle < -90 ? angle + 180 : angle;
    };
    const recordLabelX = (d: GraphNode) => {
      if (isDraggedRecord(d)) return (d.x ?? d.targetX) > centerX ? -13 : 13;
      return isFlippedRecordLabel(d) ? -12 : 12;
    };
    const recordLabelAnchor = (d: GraphNode) => {
      if (isDraggedRecord(d)) return (d.x ?? d.targetX) > centerX ? "end" : "start";
      return isFlippedRecordLabel(d) ? "end" : "start";
    };
    const recordLabelDy = (d: GraphNode) => {
      if (isDraggedRecord(d)) return "0.35em";
      return `${0.35 + (d.labelLane ?? 0) * 0.95}em`;
    };
    const recordLabelText = (d: GraphNode) => {
      return isDraggedRecord(d) ? shortLabel(d.label, 40) : shortLabel(d.label, 28);
    };
    const renderHighlightedSvgText = (
      textSelection: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown>,
      getText: (d: GraphNode) => string,
    ) => {
      textSelection.each(function renderTextParts(d) {
        const textElement = d3.select(this);
        textElement.selectAll("tspan").remove();

        for (const part of highlightParts(getText(d), labelHighlightTermRef.current)) {
          const tspan = textElement.append("tspan").text(part.text);
          if (part.isMatch) tspan.attr("class", "d3-label-highlight");
        }

        const parent = this.parentElement;
        if (!(parent instanceof SVGElement)) return;

        parent
          .querySelectorAll(".d3-label-highlight-bg")
          .forEach((element) => element.remove());
        parent
          .querySelectorAll(".d3-label-click-target")
          .forEach((element) => element.remove());

        try {
          const textBox = this.getBBox();
          const clickTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          clickTarget.setAttribute("class", "d3-label-click-target");
          clickTarget.setAttribute("x", String(textBox.x - 8));
          clickTarget.setAttribute("y", String(textBox.y - 4));
          clickTarget.setAttribute("width", String(textBox.width + 16));
          clickTarget.setAttribute("height", String(textBox.height + 8));
          clickTarget.setAttribute("rx", "4");
          parent.insertBefore(clickTarget, this);
        } catch {
          // Ignore labels that are not measurable during SVG layout updates.
        }

        textElement
          .selectAll<SVGTSpanElement, unknown>("tspan.d3-label-highlight")
          .each(function drawHighlightBackground() {
            try {
              const box = this.getBBox();
              const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
              background.setAttribute("class", "d3-label-highlight-bg");
              background.setAttribute("x", String(box.x - 2.5));
              background.setAttribute("y", String(box.y + 1));
              background.setAttribute("width", String(box.width + 5));
              background.setAttribute("height", String(Math.max(box.height - 2, 8)));
              background.setAttribute("rx", "2");
              parent.insertBefore(background, this.parentElement);
            } catch {
              // Ignore labels that are not measurable during SVG layout updates.
            }
          });
      });
    };

    const bubbleLabelGroup = bubbleNode.append("g").attr("class", "d3-node-label-group");
    const bubbleLabel = bubbleLabelGroup
      .append("text")
      .attr("class", "d3-node-label")
      .attr("dy", "-0.15em");
    renderHighlightedSvgText(bubbleLabel, (d) => shortLabel(d.label, 12));

    bubbleNode
      .append("text")
      .attr("class", "d3-node-count")
      .attr("dy", "1.35em")
      .text((d) => d.countLabel);

    const recordLabelGroup = recordNode
      .append("g")
      .attr("class", "d3-record-label-group")
      .attr("transform", (d) => `rotate(${recordLabelRotation(d)})`);

    const recordLabel = recordLabelGroup
      .append("text")
      .attr("class", "d3-record-label")
      .attr("dy", recordLabelDy)
      .attr("x", recordLabelX)
      .attr("text-anchor", recordLabelAnchor);
    renderHighlightedSvgText(recordLabel, recordLabelText);

    const updateRecordLabelOrientation = () => {
      recordNode
        .select<SVGGElement>(".d3-record-label-group")
        .attr("transform", (d) => `rotate(${recordLabelRotation(d)})`);

      const recordLabels = recordNode
        .select<SVGTextElement>(".d3-record-label")
        .attr("dy", recordLabelDy)
        .attr("x", recordLabelX)
        .attr("text-anchor", recordLabelAnchor);
      renderHighlightedSvgText(recordLabels, recordLabelText);
    };

    const nodeById = new Map(graphNodes.map((graphNode) => [graphNode.id, graphNode]));

    const childrenByParent = new Map<string, GraphNode[]>();
    for (const graphNode of graphNodes) {
      if (!graphNode.parentId) continue;
      const children = childrenByParent.get(graphNode.parentId) ?? [];
      children.push(graphNode);
      childrenByParent.set(graphNode.parentId, children);
    }
    const collectDescendants = (parentId: string) => {
      const descendants: GraphNode[] = [];
      const stack = [...(childrenByParent.get(parentId) ?? [])];

      while (stack.length) {
        const child = stack.pop();
        if (!child) continue;
        descendants.push(child);
        stack.push(...(childrenByParent.get(child.id) ?? []));
      }

      return descendants;
    };
    const collectAncestors = (graphNode: GraphNode) => {
      const ancestors: GraphNode[] = [];
      let parentId = graphNode.parentId;

      while (parentId) {
        const parent = nodeById.get(parentId);
        if (!parent) break;
        ancestors.push(parent);
        parentId = parent.parentId;
      }

      return ancestors;
    };
    const setDragFocus = (graphNode: GraphNode) => {
      const focusIds = new Set<string>(
        graphNode.isCenter ? graphNodes.map((candidate) => candidate.id) : [graphNode.id],
      );

      if (!graphNode.isCenter) {
        for (const descendant of collectDescendants(graphNode.id)) {
          focusIds.add(descendant.id);
        }

        for (const ancestor of collectAncestors(graphNode)) {
          focusIds.add(ancestor.id);
        }
      }

      layer.classed("dragging", true);
      node.classed("drag-focus", (d) => focusIds.has(d.id));
      link.classed(
        "drag-focus",
        (d) => focusIds.has(d.source) && focusIds.has(d.target),
      );
    };
    const clearDragFocus = () => {
      layer.classed("dragging", false);
      node.classed("drag-focus", false);
      link.classed("drag-focus", false);
    };
    const updateRecordAngle = (graphNode: GraphNode) => {
      const parent = graphNode.parentId ? nodeById.get(graphNode.parentId) : undefined;
      const parentX = parent?.x ?? parent?.targetX ?? centerX;
      const parentY = parent?.y ?? parent?.targetY ?? centerY;
      graphNode.angle = Math.atan2(
        (graphNode.y ?? graphNode.targetY) - parentY,
        (graphNode.x ?? graphNode.targetX) - parentX,
      );
    };
    const linkEndpoint = (graphLink: GraphLink, side: "source" | "target") => {
      const source = nodeById.get(graphLink.source);
      const target = nodeById.get(graphLink.target);
      const sourceX = source?.x ?? centerX;
      const sourceY = source?.y ?? centerY;
      const targetX = target?.x ?? centerX;
      const targetY = target?.y ?? centerY;
      const distance = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
      const sourceRadius = source?.radius ?? 0;
      const targetRadius = target?.radius ?? 0;
      const directionX = (targetX - sourceX) / distance;
      const directionY = (targetY - sourceY) / distance;

      if (side === "source") {
        return {
          x: sourceX + directionX * sourceRadius,
          y: sourceY + directionY * sourceRadius,
        };
      }

      return {
        x: targetX - directionX * targetRadius,
        y: targetY - directionY * targetRadius,
      };
    };
    const renderPositions = () => {
      link
        .attr("x1", (d) => linkEndpoint(d, "source").x)
        .attr("y1", (d) => linkEndpoint(d, "source").y)
        .attr("x2", (d) => linkEndpoint(d, "target").x)
        .attr("y2", (d) => linkEndpoint(d, "target").y);

      node.attr("transform", (d) => `translate(${d.x ?? centerX},${d.y ?? centerY})`);
    };

    let didDrag = false;
    let dragStartPosition = { x: 0, y: 0 };
    let suppressNextClick = false;
    const clickDragThreshold = 5;
    const graphItemFromNode = (d: GraphNode): GraphItem => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      countLabel: d.countLabel,
      color: d.color,
      radius: d.radius,
      parentId: d.parentId,
      isEmpty: d.isEmpty,
      theme: d.theme,
      categoryLevel2: d.categoryLevel2,
      recordId: d.recordId,
    });
    const openGraphNode = (d: GraphNode) => {
      if (d.isCenter) return;
      onNodeClick(graphItemFromNode(d));
    };
    const suppressClickOnce = () => {
      suppressNextClick = true;
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 80);
    };

    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        didDrag = false;
        dragStartPosition = { x: event.x, y: event.y };
        setDragFocus(d);
        if (d.kind === "record") {
          draggedRecordId = d.id;
          node.classed("drag-source", (candidate) => candidate.id === d.id);
          node.filter((candidate) => candidate.id === d.id).raise();
          updateRecordLabelOrientation();
        }
      })
      .on("drag", (event, d) => {
        const dragDistance = Math.hypot(
          event.x - dragStartPosition.x,
          event.y - dragStartPosition.y,
        );
        if (!didDrag && dragDistance < clickDragThreshold) return;

        didDrag = true;
        const previousX = d.x ?? d.targetX;
        const previousY = d.y ?? d.targetY;
        const deltaX = event.x - previousX;
        const deltaY = event.y - previousY;
        const movedNodes =
          d.kind === "center"
            ? graphNodes
            : [d, ...(d.kind === "level2" ? collectDescendants(d.id) : [])];

        for (const movedNode of movedNodes) {
          movedNode.x = (movedNode.x ?? movedNode.targetX) + deltaX;
          movedNode.y = (movedNode.y ?? movedNode.targetY) + deltaY;
        }

        if (d.kind === "record") {
          updateRecordAngle(d);
          updateRecordLabelOrientation();
        }

        renderPositions();
      })
      .on("end", (_event, d) => {
        if (!didDrag) {
          draggedRecordId = "";
          node.classed("drag-source", false);
          updateRecordLabelOrientation();
          clearDragFocus();
          suppressClickOnce();
          openGraphNode(d);
          window.setTimeout(() => {
            didDrag = false;
          }, 0);
          return;
        }

        if (d.kind === "center") {
          graphOffsetRef.current = {
            x: (d.x ?? d.targetX) - centerX,
            y: (d.y ?? d.targetY) - centerY,
          };

          for (const graphNode of graphNodes) {
            graphNode.targetX = graphNode.x ?? graphNode.targetX;
            graphNode.targetY = graphNode.y ?? graphNode.targetY;

            if (
              graphNode.kind !== "record" ||
              !movedRecordPositionsRef.current.has(graphNode.id)
            ) {
              continue;
            }

            movedRecordPositionsRef.current.set(graphNode.id, {
              angle: graphNode.angle,
              x: graphNode.targetX,
              y: graphNode.targetY,
            });
          }
          renderPositions();
        }

        if (d.kind === "record") {
          d.targetX = d.x ?? d.targetX;
          d.targetY = d.y ?? d.targetY;
          updateRecordAngle(d);
          movedRecordPositionsRef.current.set(d.id, {
            angle: d.angle,
            x: d.targetX,
            y: d.targetY,
          });
          renderPositions();
        }
        draggedRecordId = "";
        node.classed("drag-source", false);
        updateRecordLabelOrientation();
        clearDragFocus();
        window.setTimeout(() => {
          didDrag = false;
        }, 0);
      });

    node.call(drag);

    node.on("click", (event, d) => {
      event.stopPropagation();
      if (suppressNextClick) return;
      if (didDrag) return;
      openGraphNode(d);
    });

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (event) => {
        layer.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    const restoreTargetPositions = () => {
      graphNodes.forEach((d) => {
        d.x = d.targetX;
        d.y = d.targetY;
      });
      renderPositions();
    };

    const fitGraph = () => {
      restoreTargetPositions();

      const padding = 44;
      const bounds = {
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
      };

      node.each(function measureNodeBounds(d) {
        const x = d.x ?? d.targetX;
        const y = d.y ?? d.targetY;
        let minX = x - d.radius - 20;
        let maxX = x + d.radius + 20;
        let minY = y - d.radius - 20;
        let maxY = y + d.radius + 20;

        try {
          const box = (this as SVGGElement).getBBox();
          minX = x + box.x;
          maxX = x + box.x + box.width;
          minY = y + box.y;
          maxY = y + box.y + box.height;
        } catch {
          const x = d.x ?? d.targetX;
          const y = d.y ?? d.targetY;
          const recordBuffer = d.kind === "record" ? Math.min(Math.max(d.label.length * 7, 86), 210) : 0;
          const buffer = d.kind === "record" ? recordBuffer : d.radius + 18;
          minX = x - buffer;
          maxX = x + buffer;
          minY = y - buffer;
          maxY = y + buffer;
        }

        bounds.maxX = Math.max(bounds.maxX, maxX);
        bounds.maxY = Math.max(bounds.maxY, maxY);
        bounds.minX = Math.min(bounds.minX, minX);
        bounds.minY = Math.min(bounds.minY, minY);
      });

      const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
      const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);
      const scale = Math.min(
        1.35,
        Math.max(
          0.22,
          Math.min((width - padding * 2) / graphWidth, (height - padding * 2) / graphHeight),
        ),
      );
      const translateX = width / 2 - scale * (bounds.minX + graphWidth / 2);
      const translateY = height / 2 - scale * (bounds.minY + graphHeight / 2);

      svg
        .transition()
        .duration(420)
        .call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
    };

    const resetGraph = () => {
      graphOffsetRef.current = { x: 0, y: 0 };
      movedRecordPositionsRef.current.clear();
      graphNodes.forEach((d) => {
        const item = itemsById.get(d.id);
        const angle = item ? angleForItem(item) : 0;
        const radius =
          item?.kind === "record"
            ? recordRadius
            : item?.kind === "level2"
              ? level2Radius
              : item?.kind === "level1"
                ? level1Radius
                : 0;
        const target = item
          ? {
              angle,
              x: centerX + Math.cos(angle) * radius,
              y: centerY + Math.sin(angle) * radius,
            }
          : { x: centerX, y: centerY, angle: 0 };
        d.targetX = target.x;
        d.targetY = target.y;
        d.angle = target.angle;
      });
      updateRecordLabelOrientation();
      restoreTargetPositions();
      svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
    };

    registerControls({
      fitAll: fitGraph,
      zoomIn: () => {
        svg.transition().duration(300).call(zoom.scaleBy, 1.3);
      },
      zoomOut: () => {
        svg.transition().duration(300).call(zoom.scaleBy, 0.7);
      },
      reset: resetGraph,
    });

    fitGraph();

    return () => {
      registerControls(null);
      svg.on(".zoom", null);
    };
  }, [
    center,
    items,
    onNodeClick,
    registerControls,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    labelHighlightTermRef.current = labelHighlightTerm;
    if (!svgRef.current) return;

    const renderTextParts = (element: SVGTextElement, value: string) => {
      const textElement = d3.select(element);
      textElement.selectAll("tspan").remove();

      for (const part of highlightParts(value, labelHighlightTerm)) {
        const tspan = textElement.append("tspan").text(part.text);
        if (part.isMatch) tspan.attr("class", "d3-label-highlight");
      }

      const parent = element.parentElement;
      if (!(parent instanceof SVGElement)) return;

      parent
        .querySelectorAll(".d3-label-highlight-bg")
        .forEach((highlightElement) => highlightElement.remove());
      parent
        .querySelectorAll(".d3-label-click-target")
        .forEach((targetElement) => targetElement.remove());

      try {
        const textBox = element.getBBox();
        const clickTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        clickTarget.setAttribute("class", "d3-label-click-target");
        clickTarget.setAttribute("x", String(textBox.x - 8));
        clickTarget.setAttribute("y", String(textBox.y - 4));
        clickTarget.setAttribute("width", String(textBox.width + 16));
        clickTarget.setAttribute("height", String(textBox.height + 8));
        clickTarget.setAttribute("rx", "4");
        parent.insertBefore(clickTarget, element);
      } catch {
        // Ignore labels that are not measurable during SVG layout updates.
      }

      textElement
        .selectAll<SVGTSpanElement, unknown>("tspan.d3-label-highlight")
        .each(function drawHighlightBackground() {
          try {
            const box = this.getBBox();
            const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            background.setAttribute("class", "d3-label-highlight-bg");
            background.setAttribute("x", String(box.x - 2.5));
            background.setAttribute("y", String(box.y + 1));
            background.setAttribute("width", String(box.width + 5));
            background.setAttribute("height", String(Math.max(box.height - 2, 8)));
            background.setAttribute("rx", "2");
            parent.insertBefore(background, element);
          } catch {
            // Ignore labels that are not measurable during SVG layout updates.
          }
        });
    };

    d3.select(svgRef.current)
      .selectAll<SVGTextElement, GraphNode>(".d3-node-label")
      .each(function updateBubbleLabel(d) {
        renderTextParts(this, shortLabel(d.label, 12));
      });

    d3.select(svgRef.current)
      .selectAll<SVGTextElement, GraphNode>(".d3-record-label")
      .each(function updateRecordLabel(d) {
        const nodeElement = this.closest(".d3-node");
        const isDragSource = nodeElement?.classList.contains("drag-source") ?? false;
        renderTextParts(this, shortLabel(d.label, isDragSource ? 40 : 28));
      });
  }, [labelHighlightTerm]);

  useEffect(() => {
    if (!svgRef.current) return;

    d3.select(svgRef.current)
      .selectAll<SVGGElement, GraphNode>(".d3-node")
      .classed("active", (d) => d.id === selectedNodeId);
  }, [selectedNodeId]);

  return (
    <div className="network-canvas" ref={containerRef}>
      <svg
        aria-label="드래그 가능한 네트워크 데이터맵"
        className="d3-network-svg"
        ref={svgRef}
        role="img"
      />
    </div>
  );
}

export function DataMapClient() {
  const [dataCatalog, setDataCatalog] = useState<DataCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<KindFilter>("all");
  const [activeExtension, setActiveExtension] = useState("all");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [selectedCategoryLevel2, setSelectedCategoryLevel2] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [recordViewMode, setRecordViewMode] = useState<RecordViewMode>("network");
  const sortKey: SortKey = "views";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailQuery, setDetailQuery] = useState("");
  const [datasetPage, setDatasetPage] = useState(0);
  const [isKeywordDragging, setIsKeywordDragging] = useState(false);
  const graphControls = useRef<GraphControls | null>(null);
  const urlStateAppliedRef = useRef(false);
  const keywordPagerRef = useRef<HTMLDivElement | null>(null);
  const keywordDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    hasMoved: boolean;
  } | null>(null);
  const suppressKeywordClickRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    fetch(catalogUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`데이터 파일을 불러오지 못했습니다. (${response.status})`);
        }

        return response.json() as Promise<DataCatalog>;
      })
      .then((nextCatalog) => {
        if (!isMounted) return;
        setDataCatalog(nextCatalog);
        setCatalogError("");
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setCatalogError(
          error instanceof Error ? error.message : "데이터 파일을 불러오지 못했습니다.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (urlStateAppliedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const nextKind = params.get("kind");
    const nextView = params.get("view");
    const nextTheme = params.get("theme") ?? "";
    const nextCategory = params.get("category") ?? "";
    const nextRecord = params.get("record") ?? "";

    setQuery(params.get("q") ?? "");
    if (nextKind === "api" || nextKind === "file" || nextKind === "all") {
      setActiveKind(nextKind);
    }
    setActiveExtension(params.get("extension") ?? "all");
    setDetailQuery(params.get("detail") ?? "");
    if (nextView === "list" || nextView === "network") setRecordViewMode(nextView);
    setSelectedTheme(nextTheme);
    setSelectedCategoryLevel2(nextCategory);
    setSelectedId(nextRecord);
    setDetailsOpen(Boolean(nextTheme || nextCategory || nextRecord));
    urlStateAppliedRef.current = true;
  }, []);

  const sourceSnapshot = dataCatalog?.source ?? emptySource;
  const datasets = useMemo(() => dataCatalog?.datasets ?? [], [dataCatalog]);
  const catalogSummary = useMemo(() => summarizeCatalog(datasets), [datasets]);
  const themeOrder = useMemo(
    () => catalogSummary.byTheme.map((item) => item.name),
    [catalogSummary.byTheme],
  );

  const baseRecords = useMemo(() => {
    return datasets.filter((record) => {
      const kindMatch = activeKind === "all" || record.kind === activeKind;
      const extensionMatch =
        activeExtension === "all" || extensionLabel(record) === activeExtension;
      return kindMatch && extensionMatch && matchesDataMapSearch(record, query);
    });
  }, [activeExtension, activeKind, query, datasets]);

  const themeStats = useMemo<ThemeStat[]>(() => {
    return themeOrder.map((theme, index) => {
      const records = baseRecords.filter((record) => level1Label(record) === theme);
      const summary = summarizeRecords(records);

      return {
        theme,
        ...summary,
        color: palette[index % palette.length],
      };
    });
  }, [baseRecords, themeOrder]);

  const selectedScopeRecords = useMemo(() => {
    if (!selectedTheme) return baseRecords;

    return baseRecords.filter((record) => {
      const themeMatch = level1Label(record) === selectedTheme;
      const categoryMatch =
        !selectedCategoryLevel2 || level2Label(record) === selectedCategoryLevel2;
      return themeMatch && categoryMatch;
    });
  }, [baseRecords, selectedCategoryLevel2, selectedTheme]);

  const selectedRecords = useMemo(() => {
    return [...selectedScopeRecords].sort(compareRecords(sortKey));
  }, [selectedScopeRecords, sortKey]);

  const detailRecords = useMemo(() => {
    return selectedRecords.filter((record) => matchesDetailSearch(record, detailQuery));
  }, [detailQuery, selectedRecords]);
  const datasetPageSize = 10;
  const datasetPageCount = Math.max(Math.ceil(detailRecords.length / datasetPageSize), 1);
  const currentDatasetPage = Math.min(datasetPage, datasetPageCount - 1);
  const visibleDetailRecords = detailRecords.slice(
    currentDatasetPage * datasetPageSize,
    (currentDatasetPage + 1) * datasetPageSize,
  );
  const maxDatasetPageButtons = 5;
  const datasetPageStart = Math.max(
    0,
    Math.min(
      currentDatasetPage - Math.floor(maxDatasetPageButtons / 2),
      datasetPageCount - maxDatasetPageButtons,
    ),
  );
  const visibleDatasetPages = Array.from(
    { length: Math.min(maxDatasetPageButtons, datasetPageCount) },
    (_, index) => datasetPageStart + index,
  );

  const activeSelectedId = baseRecords.some((record) => record.id === selectedId)
    ? selectedId
    : "";

  useEffect(() => {
    if (!urlStateAppliedRef.current) return;

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (activeKind !== "all") params.set("kind", activeKind);
    if (activeExtension !== "all") params.set("extension", activeExtension);
    if (selectedTheme) params.set("theme", selectedTheme);
    if (selectedCategoryLevel2) params.set("category", selectedCategoryLevel2);
    if (activeSelectedId) params.set("record", activeSelectedId);
    if (detailQuery.trim()) params.set("detail", detailQuery.trim());
    if (recordViewMode !== "network") params.set("view", recordViewMode);

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl);
  }, [
    activeExtension,
    activeKind,
    activeSelectedId,
    detailQuery,
    query,
    recordViewMode,
    selectedCategoryLevel2,
    selectedTheme,
  ]);

  const selectedRecord =
    detailRecords.find((record) => record.id === activeSelectedId) ??
    detailRecords[0] ??
    (activeSelectedId
      ? selectedRecords.find((record) => record.id === activeSelectedId)
      : undefined) ??
    (activeSelectedId ? datasets.find((record) => record.id === activeSelectedId) : undefined) ??
    selectedRecords[0] ??
    baseRecords[0] ??
    datasets[0];
  const selectedRecordIndex = selectedRecord
    ? detailRecords.findIndex((record) => record.id === selectedRecord.id)
    : -1;
  const detailResultLabel = detailRecords.length
    ? `${formatNumber(Math.max(selectedRecordIndex, 0) + 1)}/${formatNumber(detailRecords.length)}`
    : "0/0";

  const visibleTotals = useMemo(() => {
    return {
      total: baseRecords.length,
      files: baseRecords.filter((record) => record.kind === "file").length,
      apis: baseRecords.filter((record) => record.kind === "api").length,
    };
  }, [baseRecords]);

  const selectedColor = selectedTheme
    ? (themeStats.find((stat) => stat.theme === selectedTheme)?.color ?? palette[0])
    : palette[0];
  const extensionOptions = useMemo(() => {
    return countBy(datasets.map(extensionLabel));
  }, [datasets]);
  const keywordOptions = useMemo(
    () => shuffledKeywords(datasets, sourceSnapshot.generatedAt),
    [datasets, sourceSnapshot.generatedAt],
  );

  const graphData = useMemo<{
    center: GraphItem;
    items: GraphItem[];
  }>(() => {
    const center: GraphItem = {
      id: "__center",
      kind: "center",
      label: query.trim() || "데이터현황",
      countLabel: formatNumber(visibleTotals.total),
      color: centerNodeColor,
      radius: 72,
      tooltip: [
        query.trim() || "데이터현황",
        `데이터 ${formatNumber(visibleTotals.total)}건`,
        `파일 ${formatNumber(visibleTotals.files)} · API ${formatNumber(visibleTotals.apis)}`,
      ].join("\n"),
    };
    const level1Items: GraphItem[] = themeStats.map((stat) => ({
      id: level1NodeId(stat.theme),
      kind: "level1",
      label: stat.theme,
      countLabel: stat.count ? formatNumber(stat.count) : "-",
      color: stat.color,
      radius: branchNodeRadius,
      tooltip: summaryTooltip(stat.theme, stat),
      isEmpty: stat.count === 0,
      theme: stat.theme,
    }));
    const items = [...level1Items];

    if (selectedTheme) {
      const records = baseRecords.filter((record) => level1Label(record) === selectedTheme);
      const groups = new Map<string, DatasetRecord[]>();

      for (const record of records) {
        const category = level2Label(record);
        const groupRecords = groups.get(category) ?? [];
        groupRecords.push(record);
        groups.set(category, groupRecords);
      }

      const themeIndex = Math.max(themeOrder.indexOf(selectedTheme), 0);
      items.push(
        ...[...groups.entries()]
          .sort(
            ([categoryA, recordsA], [categoryB, recordsB]) =>
              recordsB.length - recordsA.length || categoryA.localeCompare(categoryB, "ko-KR"),
          )
          .map<GraphItem>(([category, recordsInGroup], index) => {
            const summary = summarizeRecords(recordsInGroup);

            return {
              id: level2NodeId(selectedTheme, category),
              kind: "level2",
              label: category,
              countLabel: formatNumber(recordsInGroup.length),
              color: palette[(themeIndex + index + 1) % palette.length],
              radius: level2NodeRadius,
              tooltip: summaryTooltip(`${selectedTheme} > ${category}`, summary),
              parentId: level1NodeId(selectedTheme),
              theme: selectedTheme,
              categoryLevel2: category,
            };
          }),
      );

      const datasetItems = [...records].sort(compareRecords(sortKey));

      if (recordViewMode === "network") {
        items.push(
          ...datasetItems.map<GraphItem>((record) => {
            const category = level2Label(record);

            return {
              id: `record-${record.id}`,
              kind: "record",
              label: record.name,
              countLabel:
                record.kind === "api" ? "API" : record.extension || record.format || "FILE",
              color: record.kind === "api" ? "#2563eb" : "#059669",
              radius: recordDotRadius,
              tooltip: recordTooltip(record),
              parentId: level2NodeId(selectedTheme, category),
              theme: level1Label(record),
              categoryLevel2: category,
              recordId: record.id,
            };
          }),
        );
      }
    }

    return {
      center,
      items,
    };
  }, [
    baseRecords,
    query,
    recordViewMode,
    selectedTheme,
    sortKey,
    themeStats,
    themeOrder,
    visibleTotals.apis,
    visibleTotals.files,
    visibleTotals.total,
  ]);
  const selectedGraphNodeId = selectedId
    ? `record-${selectedId}`
    : selectedCategoryLevel2 && selectedTheme
      ? level2NodeId(selectedTheme, selectedCategoryLevel2)
      : selectedTheme
        ? level1NodeId(selectedTheme)
        : "";

  const registerGraphControls = useCallback((controls: GraphControls | null) => {
    graphControls.current = controls;
  }, []);

  const chooseTheme = useCallback((theme: string) => {
    setSelectedTheme(theme);
    setSelectedCategoryLevel2("");
    setSelectedId("");
    setDatasetPage(0);
    setDetailsOpen(true);
  }, []);

  const chooseCategoryLevel2 = useCallback((theme: string, category: string) => {
    setSelectedTheme(theme);
    setSelectedCategoryLevel2(category);
    setSelectedId("");
    setDatasetPage(0);
    setDetailsOpen(true);
  }, []);

  const chooseRecord = useCallback((record: DatasetRecord) => {
    setSelectedTheme(level1Label(record));
    setSelectedCategoryLevel2(level2Label(record));
    setSelectedId(record.id);
    setDetailsOpen(true);
  }, []);

  const handleGraphNodeClick = useCallback(
    (item: GraphItem) => {
      if (item.isEmpty) return;

      if (item.kind === "level1" && item.theme) {
        chooseTheme(item.theme);
        return;
      }

      if (item.kind === "level2" && item.theme && item.categoryLevel2) {
        chooseCategoryLevel2(item.theme, item.categoryLevel2);
        return;
      }

      if (item.kind === "record" && item.recordId) {
        const record = datasets.find((candidate) => candidate.id === item.recordId);
        if (record) chooseRecord(record);
      }
    },
    [chooseCategoryLevel2, chooseRecord, chooseTheme, datasets],
  );

  function applyTerm(term: string) {
    const nextRecords = datasets.filter(
      (record) => {
        const kindMatch = activeKind === "all" || record.kind === activeKind;
        const extensionMatch =
          activeExtension === "all" || extensionLabel(record) === activeExtension;
        return kindMatch && extensionMatch && matchesDataMapSearch(record, term);
      },
    );
    const nextTheme =
      themeOrder.find((theme) => nextRecords.some((record) => level1Label(record) === theme)) ??
      "";

    setQuery(term);
    setSelectedTheme(nextTheme);
    setSelectedCategoryLevel2("");
    setSelectedId("");
    setDetailQuery("");
    setDatasetPage(0);
    setDetailsOpen(true);
  }

  function focusCurrentSearch() {
    const nextTheme =
      themeOrder.find((theme) => baseRecords.some((record) => level1Label(record) === theme)) ??
      "";

    setSelectedTheme(nextTheme);
    setSelectedCategoryLevel2("");
    setSelectedId("");
    setDetailQuery("");
    setDatasetPage(0);
    setDetailsOpen(Boolean(nextTheme));
  }

  function chooseKind(kind: KindFilter) {
    setActiveKind(kind);
    setSelectedTheme("");
    setSelectedCategoryLevel2("");
    setSelectedId("");
    setDetailQuery("");
    setDatasetPage(0);
  }

  function chooseExtension(extension: string) {
    setActiveExtension(extension);
    setSelectedTheme("");
    setSelectedCategoryLevel2("");
    setSelectedId("");
    setDetailQuery("");
    setDatasetPage(0);
  }

  function chooseRecordViewMode(mode: RecordViewMode) {
    setRecordViewMode(mode);
    if (mode === "list" && selectedTheme) setDetailsOpen(true);
    window.setTimeout(() => graphControls.current?.fitAll(), 0);
  }

  function resetSearchConditions() {
    setQuery("");
    setActiveKind("all");
    setActiveExtension("all");
    setSelectedTheme("");
    setSelectedCategoryLevel2("");
    setSelectedId("");
    setDetailQuery("");
    setDatasetPage(0);
    setDetailsOpen(false);
    keywordPagerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    window.setTimeout(() => graphControls.current?.reset(), 0);
  }

  function moveKeywordPage(direction: number) {
    const element = keywordPagerRef.current;
    if (!element || isKeywordDragging) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    if (maxScrollLeft <= 0) return;

    const step = Math.max(element.clientWidth * 0.78, 220);
    element.scrollTo({
      left: Math.min(Math.max(element.scrollLeft + step * direction, 0), maxScrollLeft),
      behavior: "smooth",
    });
  }

  function suppressNextKeywordClick() {
    suppressKeywordClickRef.current = true;
    window.setTimeout(() => {
      suppressKeywordClickRef.current = false;
    }, 90);
  }

  function startKeywordDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const element = event.currentTarget;
    if (element.scrollWidth <= element.clientWidth) return;

    keywordDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: element.scrollLeft,
      hasMoved: false,
    };
  }

  function moveKeywordDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = keywordDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (!drag.hasMoved) {
        drag.hasMoved = true;
        setIsKeywordDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
      event.currentTarget.scrollLeft = drag.scrollLeft - deltaX;
    }
  }

  function finishKeywordDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = keywordDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    keywordDragRef.current = null;
    setIsKeywordDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.hasMoved) suppressNextKeywordClick();
  }

  function cancelKeywordDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = keywordDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    keywordDragRef.current = null;
    setIsKeywordDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.hasMoved) suppressNextKeywordClick();
  }

  function handleKeywordClick(keyword: string) {
    if (suppressKeywordClickRef.current) return;
    applyTerm(keyword);
  }

  function moveDetailResult(direction: number) {
    if (!detailRecords.length) return;

    const currentIndex = selectedRecordIndex >= 0 ? selectedRecordIndex : 0;
    const nextIndex = (currentIndex + direction + detailRecords.length) % detailRecords.length;
    chooseRecord(detailRecords[nextIndex]);
  }

  function moveDatasetPage(page: number) {
    setDatasetPage(Math.min(Math.max(page, 0), datasetPageCount - 1));
  }

  const isRecordDetail = Boolean(activeSelectedId && selectedRecord);
  const selectedRecordRows = isRecordDetail && selectedRecord ? recordInfoRows(selectedRecord) : [];
  const selectedPortalUrl = selectedRecord ? dataGoKrUrl(selectedRecord) : "";
  const isCatalogLoading = !dataCatalog && !catalogError;
  const currentScopeSummary = useMemo(() => summarizeRecords(detailRecords), [detailRecords]);

  return (
    <main className="datamap-page">
      <header className="map-header">
        <div className="brand-area">
          <span className="brand-mark" aria-hidden="true">
            <span>H</span>
          </span>
          <div>
            <h1>한난 데이터맵</h1>
          </div>
        </div>

        <section className="search-panel" aria-label="데이터 검색">
          <div className="search-row">
            <label className="condition-select">
              <span>데이터유형</span>
              <select
                value={activeKind}
                onChange={(event) => chooseKind(event.target.value as KindFilter)}
              >
                <option value="all">전체 유형</option>
                <option value="api">API</option>
                <option value="file">파일데이터</option>
              </select>
            </label>
            <label className="condition-select">
              <span>확장자</span>
              <select
                value={activeExtension}
                onChange={(event) => chooseExtension(event.target.value)}
              >
                <option value="all">전체 확장자</option>
                {extensionOptions.map((extension) => (
                  <option key={extension.name} value={extension.name}>
                    {extension.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="global-search-group">
              <label className="global-search">
                <span>결과 검색</span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setDatasetPage(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") focusCurrentSearch();
                  }}
                  placeholder="데이터맵 검색"
                />
              </label>
              <button className="search-submit" type="button" onClick={focusCurrentSearch} aria-label="검색">
                <Icon name="search" size={18} />
              </button>
            </div>
            <label className="result-search">
              <span>결과 내 검색</span>
              <input
                value={detailQuery}
                onChange={(event) => {
                  setDetailQuery(event.target.value);
                  setDatasetPage(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && detailRecords[0]) {
                    chooseRecord(detailRecords[0]);
                  }
                }}
                placeholder="결과 내 검색"
              />
              <span className="result-count">{detailResultLabel}</span>
              <button type="button" onClick={() => moveDetailResult(-1)} aria-label="이전 결과">
                <Icon name="chevronUp" size={16} />
              </button>
              <button type="button" onClick={() => moveDetailResult(1)} aria-label="다음 결과">
                <Icon name="chevronDown" size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailQuery("");
                  setDatasetPage(0);
                }}
                aria-label="결과 내 검색 지우기"
              >
                <Icon name="x" size={15} />
              </button>
            </label>
            <div className="keyword-row" aria-label="추천 키워드">
              <button type="button" onClick={() => moveKeywordPage(-1)} aria-label="이전 키워드">
                <Icon name="chevronLeft" size={15} />
              </button>
              <div
                className={`keyword-pager${isKeywordDragging ? " dragging" : ""}`}
                ref={keywordPagerRef}
                onClickCapture={(event) => {
                  if (!suppressKeywordClickRef.current) return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerCancel={cancelKeywordDrag}
                onPointerDown={startKeywordDrag}
                onPointerMove={moveKeywordDrag}
                onPointerUp={finishKeywordDrag}
              >
                {keywordOptions.map((keyword) => (
                  <button
                    className={query === keyword ? "active" : ""}
                    key={keyword}
                    type="button"
                    onClick={() => handleKeywordClick(keyword)}
                  >
                    {keyword}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => moveKeywordPage(1)} aria-label="다음 키워드">
                <Icon name="chevronRight" size={15} />
              </button>
            </div>
          </div>
        </section>
      </header>

      <section className="map-workspace">
        <section className="network-shell" aria-label="공공데이터 네트워크 맵">
          <div className="network-toolbar">
            <div className="view-mode-toggle" aria-label="데이터셋 표시 방식">
              <button
                className={recordViewMode === "network" ? "active" : ""}
                type="button"
                onClick={() => chooseRecordViewMode("network")}
              >
                네트워크
              </button>
              <button
                className={recordViewMode === "list" ? "active" : ""}
                type="button"
                onClick={() => chooseRecordViewMode("list")}
              >
                목록
              </button>
            </div>
            <button
              className="canvas-help-button"
              type="button"
              title="분류 노드를 클릭하면 하위 데이터가 표시됩니다."
              aria-label="간단 도움말"
            >
              <Icon name="help" size={17} />
            </button>
          </div>
          {isCatalogLoading ? <div className="canvas-status">데이터를 불러오는 중입니다.</div> : null}
          {catalogError ? <div className="canvas-status error">{catalogError}</div> : null}
          <NetworkGraph
            center={graphData.center}
            items={graphData.items}
            labelHighlightTerm={detailQuery}
            onNodeClick={handleGraphNodeClick}
            registerControls={registerGraphControls}
            selectedNodeId={selectedGraphNodeId}
          />
          <div className="canvas-map-controls" aria-label="지도 확대 축소">
            <button className="fit-view-button" type="button" onClick={() => graphControls.current?.fitAll()} aria-label="전체 보기">
              <Icon name="fitView" size={18} />
            </button>
            <button type="button" onClick={() => graphControls.current?.zoomIn()} aria-label="확대">
              <Icon name="plus" size={18} />
            </button>
            <button type="button" onClick={() => graphControls.current?.zoomOut()} aria-label="축소">
              <Icon name="minus" size={18} />
            </button>
            <button type="button" onClick={resetSearchConditions} aria-label="검색 조건 초기화">
              <Icon name="rotateCcw" size={17} />
            </button>
          </div>
        </section>

        <aside className={`detail-panel ${detailsOpen ? "" : "collapsed"} ${isRecordDetail ? "record-mode" : "list-mode"}`}>
          <div className="panel-title">
            <strong>{isRecordDetail && selectedRecord ? selectedRecord.name : "데이터 목록"}</strong>
            <div className="panel-actions">
              {isRecordDetail ? (
                <button type="button" onClick={() => setSelectedId("")} aria-label="데이터 목록으로 돌아가기">
                  <Icon name="chevronLeft" size={17} />
                </button>
              ) : null}
              <button type="button" onClick={() => setDetailsOpen(false)} aria-label="상세 닫기">
                <Icon name="x" size={17} />
              </button>
            </div>
          </div>

          <div className="detail-content" style={{ "--node-color": selectedColor } as CSSProperties}>
            {isRecordDetail && selectedRecord ? (
              <section className="record-table-view">
                <table className="record-info-table">
                  <tbody>
                    {selectedRecordRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{highlightSearchTerm(row.value, detailQuery)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedPortalUrl ? (
                  <a className="data-portal-link" href={selectedPortalUrl} target="_blank" rel="noreferrer">
                    공공데이터 바로가기
                  </a>
                ) : null}
              </section>
            ) : (
              <section className="dataset-list-section">
                {detailRecords.length ? (
                  <>
                    <div className="dataset-list-summary">
                      <span>데이터 {formatNumber(currentScopeSummary.count)}</span>
                      <span>파일 {formatNumber(currentScopeSummary.files)}</span>
                      <span>API {formatNumber(currentScopeSummary.apis)}</span>
                    </div>
                    <ol className="dataset-list">
                      {visibleDetailRecords.map((record, index) => (
                        <li key={record.id}>
                          <button type="button" onClick={() => chooseRecord(record)}>
                            <span className="dataset-index">
                              {formatNumber(currentDatasetPage * datasetPageSize + index + 1)}
                            </span>
                            <span
                              className="dataset-dot"
                              style={
                                {
                                  "--item-color": record.kind === "api" ? "#2563eb" : "#4f7fe5",
                                } as CSSProperties
                              }
                              aria-hidden="true"
                            />
                            <span className="dataset-name">
                              {highlightSearchTerm(record.name, detailQuery)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <nav className="dataset-pagination" aria-label="데이터 목록 페이지">
                      <button
                        type="button"
                        onClick={() => moveDatasetPage(0)}
                        disabled={currentDatasetPage === 0}
                        aria-label="첫 페이지"
                      >
                        <Icon name="chevronsLeft" size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDatasetPage(currentDatasetPage - 1)}
                        disabled={currentDatasetPage === 0}
                        aria-label="이전 페이지"
                      >
                        <Icon name="chevronLeft" size={15} />
                      </button>
                      {visibleDatasetPages.map((page) => (
                        <button
                          className={page === currentDatasetPage ? "active" : ""}
                          key={page}
                          type="button"
                          onClick={() => moveDatasetPage(page)}
                          aria-label={`${formatNumber(page + 1)} 페이지`}
                        >
                          {formatNumber(page + 1)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => moveDatasetPage(currentDatasetPage + 1)}
                        disabled={currentDatasetPage >= datasetPageCount - 1}
                        aria-label="다음 페이지"
                      >
                        <Icon name="chevronRight" size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDatasetPage(datasetPageCount - 1)}
                        disabled={currentDatasetPage >= datasetPageCount - 1}
                        aria-label="마지막 페이지"
                      >
                        <Icon name="chevronsRight" size={15} />
                      </button>
                    </nav>
                  </>
                ) : (
                  <div className="empty-state">조건에 맞는 데이터가 없습니다.</div>
                )}
              </section>
            )}
          </div>
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
