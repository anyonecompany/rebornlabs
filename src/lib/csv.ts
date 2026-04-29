/**
 * CSV 다운로드 유틸리티.
 * 클라이언트에서 현재 필터된 데이터를 CSV로 변환 후 즉시 다운로드합니다.
 * Excel 한글 호환을 위해 UTF-8 BOM을 포함합니다.
 */

/**
 * rows 배열을 CSV로 변환하여 파일 다운로드를 트리거합니다.
 *
 * @param filename - 다운로드될 파일명 (확장자 포함, 예: "settlements-2026-04.csv")
 * @param rows     - 다운로드할 데이터 배열. 첫 번째 행의 키가 헤더로 사용됩니다.
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => JSON.stringify(row[h] ?? ""))
        .join(","),
    ),
  ];
  const csv = csvLines.join("\n");

  // UTF-8 BOM (﻿) — Excel에서 한글이 깨지지 않도록
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
