import * as Y from "yjs";
import ExcelJS from "exceljs";

export interface ColMeta {
  width?: number;
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  type?: "text" | "number" | "dropdown" | "date" | "checkbox" | "person" | "file";
  options?: string[];
}

export interface RowMeta {
  height?: number;
  hidden?: boolean;
}

export interface SheetMeta {
  id: string;
  name: string;
  status: number;
  order: number;
}

/**
 * Generate a stable ID for rows and columns
 */
export function generateStableId(prefix: "r" | "c" | "s"): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36)}`;
}

/**
 * Builds a collaborative Y.Doc from initial FortuneSheet sheets data or template.
 * Stores rows and columns as Y.Arrays of stable IDs, and cells in a Y.Map keyed by `rowId:colId`.
 */
export function buildYDocFromSheets(sheetsData: any[]): Y.Doc {
  const ydoc = new Y.Doc();

  ydoc.transact(() => {
    const sheetsArray = ydoc.getArray<SheetMeta>("sheets");

    sheetsData.forEach((sheet, sheetIdx) => {
      const sheetId = sheet.id || `sheet_${sheetIdx + 1}`;
      sheetsArray.push([
        {
          id: sheetId,
          name: sheet.name || `Sheet ${sheetIdx + 1}`,
          status: sheet.status ?? (sheetIdx === 0 ? 1 : 0),
          order: sheetIdx,
        },
      ]);

      const rowsArray = ydoc.getArray<string>(`sheet_${sheetId}_rows`);
      const colsArray = ydoc.getArray<string>(`sheet_${sheetId}_cols`);
      const cellsMap = ydoc.getMap<any>(`sheet_${sheetId}_cells`);
      const colMetaMap = ydoc.getMap<ColMeta>(`sheet_${sheetId}_col_meta`);
      const rowMetaMap = ydoc.getMap<RowMeta>(`sheet_${sheetId}_row_meta`);

      const totalRows = sheet.row ?? 36;
      const totalCols = sheet.column ?? 26;

      const rowIds: string[] = [];
      for (let r = 0; r < totalRows; r++) {
        const rId = generateStableId("r");
        rowIds.push(rId);
      }
      rowsArray.push(rowIds);

      const colIds: string[] = [];
      for (let c = 0; c < totalCols; c++) {
        const cId = generateStableId("c");
        colIds.push(cId);

        // Check if there is predefined column metadata (e.g. from templates)
        if (sheet.columnMeta && sheet.columnMeta[c]) {
          colMetaMap.set(cId, sheet.columnMeta[c]);
        }
      }
      colsArray.push(colIds);

      // Populate celldata
      if (Array.isArray(sheet.celldata)) {
        sheet.celldata.forEach((item: any) => {
          if (
            item &&
            typeof item.r === "number" &&
            typeof item.c === "number" &&
            item.r < rowIds.length &&
            item.c < colIds.length
          ) {
            const key = `${rowIds[item.r]}:${colIds[item.c]}`;
            cellsMap.set(key, item.v);
          }
        });
      } else if (Array.isArray(sheet.data)) {
        sheet.data.forEach((rowArr: any[], r: number) => {
          if (r < rowIds.length && Array.isArray(rowArr)) {
            rowArr.forEach((cellVal: any, c: number) => {
              if (c < colIds.length && cellVal !== null && cellVal !== undefined) {
                const key = `${rowIds[r]}:${colIds[c]}`;
                cellsMap.set(key, cellVal);
              }
            });
          }
        });
      }
    });
  });

  return ydoc;
}

/**
 * Converts a Y.Doc to FortuneSheet JSON data.
 * If sanitizedForClient is true, removes all columns where `hidden === true`,
 * and marks cells in locked columns with `editable: false` / `isLocked: true`.
 */
export function yDocToFortuneSheet(
  ydoc: Y.Doc,
  sanitizedForClient: boolean = false
): any[] {
  const sheetsArray = ydoc.getArray<SheetMeta>("sheets").toArray();
  if (sheetsArray.length === 0) {
    return [];
  }

  return sheetsArray.map((sheetMeta) => {
    const sId = sheetMeta.id;
    const rowIds = ydoc.getArray<string>(`sheet_${sId}_rows`).toArray();
    let colIds = ydoc.getArray<string>(`sheet_${sId}_cols`).toArray();
    const cellsMap = ydoc.getMap<any>(`sheet_${sId}_cells`);
    const colMetaMap = ydoc.getMap<ColMeta>(`sheet_${sId}_col_meta`);
    const rowMetaMap = ydoc.getMap<RowMeta>(`sheet_${sId}_row_meta`);

    // In sanitized mode, completely filter out hidden columns
    if (sanitizedForClient) {
      colIds = colIds.filter((cId) => {
        const meta = colMetaMap.get(cId);
        return !meta || !meta.hidden;
      });
    }

    const celldata: any[] = [];
    let nonEmptyCount = 0;

    rowIds.forEach((rId, rIndex) => {
      colIds.forEach((cId, cIndex) => {
        const key = `${rId}:${cId}`;
        const rawCell = cellsMap.get(key);
        const colMeta = colMetaMap.get(cId);

        if (rawCell !== undefined && rawCell !== null) {
          nonEmptyCount++;
          let cellValue = typeof rawCell === "object" ? { ...rawCell } : { v: rawCell, m: String(rawCell) };

          // If client mode and column is locked, prevent client edits
          if (sanitizedForClient && colMeta && colMeta.locked) {
            cellValue.isLocked = true;
          }

          celldata.push({
            r: rIndex,
            c: cIndex,
            rowId: rId,
            colId: cId,
            v: cellValue,
          });
        }
      });
    });

    // Column widths and metadata
    const collen: Record<string, number> = {};
    const colMetadataList: any[] = [];
    colIds.forEach((cId, cIndex) => {
      const meta = colMetaMap.get(cId) || {};
      if (meta.width) {
        collen[String(cIndex)] = meta.width;
      }
      colMetadataList.push({
        colId: cId,
        colIndex: cIndex,
        ...meta,
      });
    });

    const rowlen: Record<string, number> = {};
    rowIds.forEach((rId, rIndex) => {
      const meta = rowMetaMap.get(rId) || {};
      if (meta.height) {
        rowlen[String(rIndex)] = meta.height;
      }
    });

    return {
      id: sId,
      name: sheetMeta.name,
      status: sheetMeta.status,
      row: rowIds.length,
      column: colIds.length,
      rowIds,
      colIds,
      columnMeta: colMetadataList,
      config: {
        columnlen: collen,
        rowlen: rowlen,
      },
      celldata,
    };
  });
}

/**
 * Extracts plain text and public plain text from the Y.Doc for search indexing.
 */
export function extractSpreadsheetData(ydoc: Y.Doc) {
  const sheets = yDocToFortuneSheet(ydoc, false);
  const sanitizedSheets = yDocToFortuneSheet(ydoc, true);

  const plainTexts: string[] = [];
  const publicTexts: string[] = [];
  let totalRows = 0;
  let totalCols = 0;
  let totalCells = 0;

  sheets.forEach((sheet) => {
    totalRows += sheet.row || 0;
    totalCols += sheet.column || 0;
    plainTexts.push(`--- ${sheet.name} ---`);
    if (Array.isArray(sheet.celldata)) {
      sheet.celldata.forEach((item: any) => {
        totalCells++;
        const val = item.v?.m ?? item.v?.v ?? "";
        if (val) plainTexts.push(String(val));
      });
    }
  });

  sanitizedSheets.forEach((sheet) => {
    publicTexts.push(`--- ${sheet.name} ---`);
    if (Array.isArray(sheet.celldata)) {
      sheet.celldata.forEach((item: any) => {
        const val = item.v?.m ?? item.v?.v ?? "";
        if (val) publicTexts.push(String(val));
      });
    }
  });

  return {
    contentJson: sheets,
    plainText: plainTexts.join(" "),
    publicPlainText: publicTexts.join(" "),
    rowCount: totalRows,
    colCount: totalCols,
    cellCount: totalCells,
  };
}

/**
 * Set cell value in live Y.Doc by stable rowId and colId
 */
export function setCellInLiveDoc(
  ydoc: Y.Doc,
  sheetId: string,
  rowId: string,
  colId: string,
  value: any
): boolean {
  let updated = false;
  ydoc.transact(() => {
    const rowsArray = ydoc.getArray<string>(`sheet_${sheetId}_rows`);
    const colsArray = ydoc.getArray<string>(`sheet_${sheetId}_cols`);
    const rowList = rowsArray.toArray();
    if (rowList.indexOf(rowId) === -1) {
      rowsArray.push([rowId]);
    }
    const colList = colsArray.toArray();
    if (colList.indexOf(colId) === -1) {
      colsArray.push([colId]);
    }

    const cellsMap = ydoc.getMap<any>(`sheet_${sheetId}_cells`);
    const key = `${rowId}:${colId}`;
    if (value === null || value === undefined || (typeof value === "object" && value.v === null && !value.f)) {
      cellsMap.delete(key);
    } else {
      const cellObj = typeof value === "object" ? value : { v: value, m: String(value) };
      cellsMap.set(key, cellObj);
    }
    updated = true;
  });
  return updated;
}

/**
 * Insert row at specific index with stable ID
 */
export function insertRowInLiveDoc(
  ydoc: Y.Doc,
  sheetId: string,
  index: number
): string {
  const newRowId = generateStableId("r");
  ydoc.transact(() => {
    const rowsArray = ydoc.getArray<string>(`sheet_${sheetId}_rows`);
    if (index >= 0 && index <= rowsArray.length) {
      rowsArray.insert(index, [newRowId]);
    } else {
      rowsArray.push([newRowId]);
    }
  });
  return newRowId;
}

/**
 * Lock or hide column in live Y.Doc
 */
export function setColumnMetaInLiveDoc(
  ydoc: Y.Doc,
  sheetId: string,
  colId: string,
  metaUpdates: Partial<ColMeta>
): void {
  ydoc.transact(() => {
    const colMetaMap = ydoc.getMap<ColMeta>(`sheet_${sheetId}_col_meta`);
    const existing = colMetaMap.get(colId) || {};
    colMetaMap.set(colId, { ...existing, ...metaUpdates });
  });
}

/**
 * Parse Excel (.xlsx) buffer or CSV string and convert into Sheets data
 */
export async function parseExcelOrCsvBuffer(
  buffer: Buffer,
  filename: string
): Promise<any[]> {
  const workbook = new ExcelJS.Workbook();
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const csvContent = buffer.toString("utf-8");
    const stream = require("stream");
    const readable = stream.Readable.from([csvContent]);
    await workbook.csv.read(readable);
  } else {
    await workbook.xlsx.load(buffer as any);
  }

  const sheetsData: any[] = [];

  workbook.eachSheet((worksheet, sheetId) => {
    const celldata: any[] = [];
    const maxRow = Math.max(worksheet.rowCount || 36, 36);
    const maxCol = Math.max(worksheet.columnCount || 26, 26);

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        let val: any = cell.value;
        let formula: string | undefined;

        if (val && typeof val === "object") {
          if ("formula" in val) {
            formula = `=${val.formula}`;
            val = val.result ?? "";
          } else if ("richText" in val) {
            val = val.richText.map((t: any) => t.text).join("");
          } else if ("text" in val) {
            val = val.text;
          }
        }

        const cellItem: any = {
          v: {
            v: val,
            m: String(val ?? ""),
            ct: { fa: "General", t: typeof val === "number" ? "n" : "s" },
          },
        };
        if (formula) {
          cellItem.v.f = formula;
        }

        celldata.push({
          r: rowNumber - 1,
          c: colNumber - 1,
          v: cellItem.v,
        });
      });
    });

    sheetsData.push({
      id: `sheet_${sheetId}`,
      name: worksheet.name || `Sheet ${sheetId}`,
      status: sheetId === 1 ? 1 : 0,
      row: maxRow,
      column: maxCol,
      celldata,
    });
  });

  return sheetsData.length > 0 ? sheetsData : [
    {
      id: "sheet_1",
      name: "Sheet 1",
      status: 1,
      row: 36,
      column: 26,
      celldata: [],
    },
  ];
}
