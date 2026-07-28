import catalog from "../public/data/hanan-datasets.json";

export type DatasetKind = "file" | "api";

export type NamedCount = {
  name: string;
  count: number;
};

export type DatasetRecord = {
  id: string;
  sourceId: string;
  kind: DatasetKind;
  name: string;
  originalName: string;
  slug: string;
  theme: string;
  category: string;
  categoryGroup: string;
  provider: string;
  department: string;
  departmentPhone: string;
  searchDate: string;
  createdAt: string;
  updatedAt: string;
  nextUpdateAt: string;
  firstRegisteredAt: string;
  updateCycle: string;
  mediaType: string;
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
  url: string;
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

export type DataCatalog = {
  source: {
    organization: string;
    portal: string;
    asOf: string;
    generatedAt: string;
    workbooks: Array<{ role: string; fileName: string }>;
  };
  summary: {
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
  datasets: DatasetRecord[];
};

export const dataCatalog = catalog as DataCatalog;
export const sourceSnapshot = dataCatalog.source;
export const dataSummary = dataCatalog.summary;
export const datasets = dataCatalog.datasets;
export const themeOrder = dataSummary.byTheme.map((item) => item.name);
