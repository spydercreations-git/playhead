import * as Y from "yjs";

export interface ColMeta {
  colId?: string;
  width?: number;
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  type?: "text" | "number" | "dropdown" | "date" | "checkbox" | "person" | "file";
  options?: string[];
}

export interface RowMeta {
  rowId?: string;
  height?: number;
  hidden?: boolean;
}

export interface SheetMeta {
  id: string;
  name: string;
  status: number;
  order: number;
}

export function generateStableId(prefix: "r" | "c" | "s"): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36)}`;
}

/**
 * Rebuilds FortuneSheet sheets array directly from live Y.Doc state
 */
export function buildSheetsFromYDoc(ydoc: Y.Doc, isClient: boolean = false): any[] {
  const sheetsArray = ydoc.getArray<SheetMeta>("sheets").toArray();
  if (!sheetsArray || sheetsArray.length === 0) {
    return [];
  }

  return sheetsArray.map((sheetMeta, sIdx) => {
    const sId = sheetMeta.id || `sheet_${sIdx + 1}`;
    const rowIds = ydoc.getArray<string>(`sheet_${sId}_rows`).toArray();
    let colIds = ydoc.getArray<string>(`sheet_${sId}_cols`).toArray();
    const cellsMap = ydoc.getMap<any>(`sheet_${sId}_cells`);
    const colMetaMap = ydoc.getMap<ColMeta>(`sheet_${sId}_col_meta`);
    const rowMetaMap = ydoc.getMap<RowMeta>(`sheet_${sId}_row_meta`);
    const configMap = ydoc.getMap<any>(`sheet_${sId}_config`);

    // Clients NEVER see hidden columns
    if (isClient) {
      colIds = colIds.filter((cId) => {
        const meta = colMetaMap.get(cId);
        return !meta || !meta.hidden;
      });
    }

    const celldata: any[] = [];
    rowIds.forEach((rId, rIndex) => {
      colIds.forEach((cId, cIndex) => {
        const key = `${rId}:${cId}`;
        const raw = cellsMap.get(key);
        const colMeta = colMetaMap.get(cId);

        if (raw !== undefined && raw !== null) {
          let cellValue = typeof raw === "object" ? { ...raw } : { v: raw, m: String(raw) };
          if (isClient && colMeta?.locked) {
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

    const collen: Record<string, number> = {};
    const colMetadataList: any[] = [];
    colIds.forEach((cId, cIndex) => {
      const meta = colMetaMap.get(cId) || {};
      if (meta.width) collen[String(cIndex)] = meta.width;
      colMetadataList.push({
        colId: cId,
        colIndex: cIndex,
        ...meta,
      });
    });

    const rowlen: Record<string, number> = {};
    rowIds.forEach((rId, rIndex) => {
      const meta = rowMetaMap.get(rId) || {};
      if (meta.height) rowlen[String(rIndex)] = meta.height;
    });

    return {
      id: sId,
      name: sheetMeta.name,
      status: sheetMeta.status,
      order: sheetMeta.order ?? sIdx,
      row: Math.max(rowIds.length, 30),
      column: Math.max(colIds.length, 10),
      rowIds,
      colIds,
      columnMeta: colMetadataList,
      config: {
        columnlen: collen,
        rowlen: rowlen,
        merge: configMap.get("merge") || {},
        borderInfo: configMap.get("borderInfo") || [],
      },
      frozen: configMap.get("frozen"),
      celldata,
    };
  });
}

/**
 * Initializes Y.Doc from initial template or sheets data if empty
 */
export function populateYDocIfEmpty(ydoc: Y.Doc, initialSheets: any[]) {
  const existingSheets = ydoc.getArray<SheetMeta>("sheets");
  if (existingSheets.length > 0) return;

  ydoc.transact(() => {
    initialSheets.forEach((sheet, sheetIdx) => {
      const sheetId = sheet.id || `sheet_${sheetIdx + 1}`;
      existingSheets.push([
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
      const configMap = ydoc.getMap<any>(`sheet_${sheetId}_config`);

      const totalRows = Math.max(sheet.row || 30, sheet.celldata ? Math.max(...sheet.celldata.map((c: any) => c.r + 1)) : 30);
      const totalCols = Math.max(sheet.column || 10, sheet.celldata ? Math.max(...sheet.celldata.map((c: any) => c.c + 1)) : 10);

      const rowIds: string[] = [];
      for (let r = 0; r < totalRows; r++) {
        rowIds.push(generateStableId("r"));
      }
      rowsArray.push(rowIds);

      const colIds: string[] = [];
      for (let c = 0; c < totalCols; c++) {
        const cId = generateStableId("c");
        colIds.push(cId);

        if (sheet.columnMeta && sheet.columnMeta[c]) {
          colMetaMap.set(cId, sheet.columnMeta[c]);
        }
      }
      colsArray.push(colIds);

      if (sheet.config?.merge) configMap.set("merge", sheet.config.merge);
      if (sheet.config?.borderInfo) configMap.set("borderInfo", sheet.config.borderInfo);
      if (sheet.frozen) configMap.set("frozen", sheet.frozen);

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
      }
    });
  }, "init_template");
}

/**
 * Translates FortuneSheet Ops to Y.Doc changes using stable row & column IDs
 */
export function applyFortuneSheetOpsToYDoc(
  ydoc: Y.Doc,
  ops: any[],
  activeSheetId: string
): { affectedSheetId: string; affectedCells: { r: number; c: number; rowId: string; colId: string; value: any }[] } {
  let affectedSheetId = activeSheetId;
  const affectedCells: { r: number; c: number; rowId: string; colId: string; value: any }[] = [];

  ydoc.transact(() => {
    ops.forEach((op: any) => {
      const sId = op.id || activeSheetId;
      affectedSheetId = sId;

      const rowsArray = ydoc.getArray<string>(`sheet_${sId}_rows`);
      const colsArray = ydoc.getArray<string>(`sheet_${sId}_cols`);
      const cellsMap = ydoc.getMap<any>(`sheet_${sId}_cells`);
      const colMetaMap = ydoc.getMap<ColMeta>(`sheet_${sId}_col_meta`);
      const rowMetaMap = ydoc.getMap<RowMeta>(`sheet_${sId}_row_meta`);
      const configMap = ydoc.getMap<any>(`sheet_${sId}_config`);

      // 1. Cell edits & format updates
      if (Array.isArray(op.path) && op.path[0] === "data") {
        const r = typeof op.path[1] === "number" ? op.path[1] : parseInt(String(op.path[1]), 10);
        const c = typeof op.path[2] === "number" ? op.path[2] : parseInt(String(op.path[2]), 10);

        if (!isNaN(r) && !isNaN(c)) {
          // If out of bounds, expand rows/cols
          while (rowsArray.length <= r) {
            rowsArray.push([generateStableId("r")]);
          }
          while (colsArray.length <= c) {
            colsArray.push([generateStableId("c")]);
          }

          const rowId = rowsArray.get(r);
          const colId = colsArray.get(c);
          const key = `${rowId}:${colId}`;

          if (op.path.length === 3) {
            // Whole cell replace
            if (op.value === null || op.value === undefined) {
              cellsMap.delete(key);
            } else {
              cellsMap.set(key, op.value);
            }
            affectedCells.push({ r, c, rowId, colId, value: op.value });
          } else if (op.path.length > 3) {
            // Specific cell attribute like 'v', 'm', 'bg', 'fc'
            const attr = op.path[3];
            const current = cellsMap.get(key) || {};
            const cellObj = typeof current === "object" ? { ...current } : { v: current, m: String(current) };
            cellObj[attr] = op.value;
            cellsMap.set(key, cellObj);
            affectedCells.push({ r, c, rowId, colId, value: cellObj });
          }
        }
      }

      // 2. Insert row or column
      else if (op.op === "insertRowCol") {
        const type = op.value?.type || op.type;
        const index = op.value?.index ?? op.index;
        const count = op.value?.count ?? op.count ?? 1;
        const direction = op.value?.direction ?? op.direction ?? "lefttop";

        const insertIdx = direction === "rightbottom" ? index + 1 : index;

        if (type === "row") {
          const newIds: string[] = [];
          for (let i = 0; i < count; i++) newIds.push(generateStableId("r"));
          const safeIdx = Math.max(0, Math.min(insertIdx, rowsArray.length));
          rowsArray.insert(safeIdx, newIds);
        } else if (type === "column") {
          const newIds: string[] = [];
          for (let i = 0; i < count; i++) newIds.push(generateStableId("c"));
          const safeIdx = Math.max(0, Math.min(insertIdx, colsArray.length));
          colsArray.insert(safeIdx, newIds);
        }
      }

      // 3. Delete row or column
      else if (op.op === "deleteRowCol") {
        const type = op.value?.type || op.type;
        const start = op.value?.start ?? op.start;
        const end = op.value?.end ?? op.end;
        const deleteCount = end - start + 1;

        if (type === "row" && start >= 0 && start + deleteCount <= rowsArray.length) {
          rowsArray.delete(start, deleteCount);
        } else if (type === "column" && start >= 0 && start + deleteCount <= colsArray.length) {
          colsArray.delete(start, deleteCount);
        }
      }

      // 4. Column width / Row height resize
      else if (Array.isArray(op.path) && op.path[0] === "config") {
        if (op.path[1] === "columnlen") {
          const c = parseInt(String(op.path[2]), 10);
          if (c < colsArray.length) {
            const colId = colsArray.get(c);
            const meta = colMetaMap.get(colId) || {};
            colMetaMap.set(colId, { ...meta, width: op.value });
          }
        } else if (op.path[1] === "rowlen") {
          const r = parseInt(String(op.path[2]), 10);
          if (r < rowsArray.length) {
            const rowId = rowsArray.get(r);
            const meta = rowMetaMap.get(rowId) || {};
            rowMetaMap.set(rowId, { ...meta, height: op.value });
          }
        } else if (op.path[1] === "merge") {
          configMap.set("merge", op.value);
        } else if (op.path[1] === "borderInfo") {
          configMap.set("borderInfo", op.value);
        }
      }

      // 5. Freeze panes
      else if (Array.isArray(op.path) && op.path[0] === "frozen") {
        configMap.set("frozen", op.value);
      }

      // 6. Sheet operations (Add / Delete / Rename)
      else if (op.op === "addSheet") {
        const sheetsArray = ydoc.getArray<SheetMeta>("sheets");
        const newSheetId = op.value?.id || generateStableId("s");
        sheetsArray.push([
          {
            id: newSheetId,
            name: op.value?.name || `Sheet ${sheetsArray.length + 1}`,
            status: 0,
            order: sheetsArray.length,
          },
        ]);
        // Init row & col arrays for the new sheet
        const newRows = ydoc.getArray<string>(`sheet_${newSheetId}_rows`);
        const newCols = ydoc.getArray<string>(`sheet_${newSheetId}_cols`);
        const rIds: string[] = [];
        for (let r = 0; r < 30; r++) rIds.push(generateStableId("r"));
        newRows.push(rIds);
        const cIds: string[] = [];
        for (let c = 0; c < 10; c++) cIds.push(generateStableId("c"));
        newCols.push(cIds);
      } else if (op.op === "deleteSheet") {
        const targetId = op.value?.id || op.id;
        const sheetsArray = ydoc.getArray<SheetMeta>("sheets");
        const idx = sheetsArray.toArray().findIndex((s) => s.id === targetId);
        if (idx !== -1) {
          sheetsArray.delete(idx, 1);
        }
      } else if (Array.isArray(op.path) && op.path[0] === "name") {
        const sheetsArray = ydoc.getArray<SheetMeta>("sheets");
        const arr = sheetsArray.toArray();
        const idx = arr.findIndex((s) => s.id === sId);
        if (idx !== -1) {
          const item = arr[idx];
          sheetsArray.delete(idx, 1);
          sheetsArray.insert(idx, [{ ...item, name: op.value }]);
        }
      }
    });
  }, "team_local_op");

  return { affectedSheetId, affectedCells };
}
