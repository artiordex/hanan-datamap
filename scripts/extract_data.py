# -*- coding: utf-8 -*-
import json
import os
import re

from openpyxl import load_workbook


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app"))


def workbook_paths():
    books = []
    for name in os.listdir(ROOT):
        if not name.endswith(".xlsx") or name.startswith("~$"):
            continue
        path = os.path.join(ROOT, name)
        wb = load_workbook(path, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        books.append((path, len(wb.sheetnames), ws.max_column))
    file_path = next(path for path, sheets, cols in books if sheets == 1 and cols == 27)
    api_path = next(path for path, sheets, cols in books if sheets == 1 and cols == 21)
    return file_path, api_path


def text(value):
    return "" if value is None else str(value).strip()


def as_int(value):
    try:
        return int(float(text(value).replace(",", "")))
    except Exception:
        return 0


def norm_title(value):
    result = text(value)
    result = re.sub(r"^한국지역난방공사[_\s]+", "", result)
    result = re.sub(r"_?[0-9]{8}$", "", result)
    result = re.sub(r"_?[0-9]{6}$", "", result)
    result = re.sub(r"\s+", " ", result).strip(" _")
    return result


def compact_desc(value, limit=220):
    result = re.sub(r"\s+", " ", text(value)).strip()
    if len(result) > limit:
        return result[:limit].rstrip() + "..."
    return result


def keywords(value):
    result = []
    seen = set()
    for token in re.split(r"[,/;\s]+", text(value)):
        token = token.strip()
        if len(token) > 1 and token not in seen:
            result.append(token)
            seen.add(token)
    return result[:12]


DOMAIN_RULES = [
    ("AI·이미지", ["학습용", "이미지", "사진", "영상", "열화상", "항공사진"]),
    (
        "설비·자산",
        [
            "설비",
            "열수송",
            "배관",
            "맨홀",
            "밸브",
            "지하매설물",
            "관로",
            "공급시설",
            "시설",
            "정비",
            "보수",
            "자재",
            "진단",
            "준공",
            "용량",
        ],
    ),
    (
        "고객·요금",
        ["고객", "요금", "민원", "세대", "건물별", "계량기", "공사비부담금", "사용자", "계약종별"],
    ),
    (
        "환경·안전",
        [
            "온실가스",
            "배출",
            "탄소",
            "CDM",
            "RPS",
            "REC",
            "환경",
            "대기",
            "기상",
            "외기온도",
            "강수량",
            "안전",
            "재난",
            "태양광",
            "신재생",
        ],
    ),
    (
        "경영·행정",
        ["입찰", "계약", "감사", "ESG", "예산", "인사", "조직", "직원", "공시", "공공데이터", "만족도", "채용", "위탁"],
    ),
    (
        "지역·공급",
        ["지역별", "권역", "지사별", "지사", "공급현황", "공급지역", "한난맵", "행정구역", "관말지역", "건물별"],
    ),
    (
        "에너지 수요·생산",
        [
            "열생산",
            "열수요",
            "열판매",
            "열공급",
            "전력수요",
            "발전량",
            "전력량",
            "연료",
            "난방지수",
            "난방",
            "냉방",
            "사용량",
            "수요",
            "판매량",
            "공급량",
            "발열량",
        ],
    ),
]


def classify(title, category, keyword_values, desc):
    blob = " ".join([title, category, " ".join(keyword_values), desc])
    for domain, tokens in DOMAIN_RULES:
        if any(token in blob for token in tokens):
            return domain
    return "기타"


def time_scale(title, keyword_values, desc, update):
    blob = " ".join([title, " ".join(keyword_values), desc, update])
    checks = [
        ("분", ["분단위", "분별"]),
        ("시간", ["시간대별", "시간별", "시각별"]),
        ("일", ["일자별", "일별", "날짜"]),
        ("월", ["월별"]),
        ("연", ["연도별", "연간", "년도"]),
    ]
    for label, tokens in checks:
        if any(token in blob for token in tokens):
            return label
    if "수시" in update:
        return "수시"
    return "미상"


def space_scale(title, keyword_values, desc):
    blob = " ".join([title, " ".join(keyword_values), desc])
    checks = [
        ("지사", ["지사별", "지사"]),
        ("지역", ["지역별", "권역", "행정구역", "수도권", "충청", "영남", "광주전남", "대구"]),
        ("건물·세대", ["건물별", "세대별", "세대", "고객"]),
        ("설비", ["설비", "배관", "열수송관", "맨홀", "밸브", "발전소", "시설"]),
    ]
    for label, tokens in checks:
        if any(token in blob for token in tokens):
            return label
    return "전사/공통"


def build_records():
    file_path, api_path = workbook_paths()
    records = []

    wb = load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(value not in (None, "") for value in row):
            continue
        title = norm_title(row[3])
        keyword_values = keywords(row[21])
        desc = compact_desc(row[23])
        category = text(row[4])
        update = text(row[10]) or "미상"
        records.append(
            {
                "id": text(row[1]) or f"file-{len(records) + 1}",
                "title": title,
                "kind": "file",
                "domain": classify(title, category, keyword_values, desc),
                "category": category,
                "format": text(row[16]) or "파일",
                "updateCycle": update,
                "views": as_int(row[17]),
                "downloads": as_int(row[19]),
                "applications": 0,
                "rows": as_int(row[15]),
                "keywords": keyword_values,
                "description": desc,
                "url": text(row[25]),
                "timeScale": time_scale(title, keyword_values, desc, update),
                "spaceScale": space_scale(title, keyword_values, desc),
            }
        )

    wb = load_workbook(api_path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(value not in (None, "") for value in row):
            continue
        title = norm_title(row[3])
        keyword_values = keywords(row[12])
        desc = ""
        category = text(row[4])
        api_format = "/".join([value for value in [text(row[8]), text(row[9])] if value]) or "API"
        records.append(
            {
                "id": text(row[1]) or f"api-{len(records) + 1}",
                "title": title,
                "kind": "api",
                "domain": classify(title, category, keyword_values, desc),
                "category": category,
                "format": api_format,
                "updateCycle": "API",
                "views": as_int(row[10]),
                "downloads": 0,
                "applications": as_int(row[11]),
                "rows": 0,
                "keywords": keyword_values,
                "description": desc,
                "url": text(row[20]),
                "timeScale": time_scale(title, keyword_values, desc, "API"),
                "spaceScale": space_scale(title, keyword_values, desc),
            }
        )

    records.sort(key=lambda record: (record["domain"], record["kind"], record["title"]))
    return records


def write_typescript(records):
    output = "export type DatasetRecord = {\n"
    output += "  id: string;\n  title: string;\n  kind: 'file' | 'api';\n"
    output += "  domain: string;\n  category: string;\n  format: string;\n"
    output += "  updateCycle: string;\n  views: number;\n  downloads: number;\n"
    output += "  applications: number;\n  rows: number;\n  keywords: string[];\n"
    output += "  description: string;\n  url: string;\n  timeScale: string;\n"
    output += "  spaceScale: string;\n};\n\n"
    output += "export const sourceSnapshot = {\n"
    output += "  organization: '한국지역난방공사',\n"
    output += "  portal: '공공데이터포털',\n"
    output += "  asOf: '2026-07-07',\n"
    output += "  extracted: '2026-07-27',\n"
    output += "};\n\n"
    output += "export const datasets = "
    output += json.dumps(records, ensure_ascii=False, indent=2)
    output += " satisfies DatasetRecord[];\n"

    with open(os.path.join(APP_DIR, "data.ts"), "w", encoding="utf-8") as handle:
        handle.write(output)


if __name__ == "__main__":
    write_typescript(build_records())
