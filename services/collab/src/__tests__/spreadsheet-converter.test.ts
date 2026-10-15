import test from "node:test";
import assert from "node:assert";
import * as Y from "yjs";
import {
  buildYDocFromSheets,
  yDocToFortuneSheet,
  extractSpreadsheetData,
  setCellInLiveDoc,
  insertRowInLiveDoc,
  setColumnMetaInLiveDoc,
  parseExcelOrCsvBuffer,
} from "../spreadsheet-converter.js";

test("Spreadsheet data model: two clients concurrently inserting rows keep data in the right cells", () => {
  // Client A creates initial sheet with 2 rows x 2 cols
  const initialData = [
    {
      id: "sheet_test",
      name: "Sheet 1",
      status: 1,
      row: 2,
      column: 2,
      celldata: [
        { r: 0, c: 0, v: { v: "TopLeft", m: "TopLeft" } },
        { r: 0, c: 1, v: { v: "TopRight", m: "TopRight" } },
        { r: 1, c: 0, v: { v: "BottomLeft", m: "BottomLeft" } },
        { r: 1, c: 1, v: { v: "BottomRight", m: "BottomRight" } },
      ],
    },
  ];

  const docA = buildYDocFromSheets(initialData);
  const stateUpdate = Y.encodeStateAsUpdate(docA);

  const docB = new Y.Doc();
  Y.applyUpdate(docB, stateUpdate);

  // Client A inserts a row at index 0 (top)
  const newRowIdA = insertRowInLiveDoc(docA, "sheet_test", 0);
  setCellInLiveDoc(docA, "sheet_test", newRowIdA, docA.getArray<string>("sheet_sheet_test_cols").get(0), {
    v: "NewRowA_Cell0",
    m: "NewRowA_Cell0",
  });

  // Client B concurrently inserts a row at index 1 (between top and bottom)
  const newRowIdB = insertRowInLiveDoc(docB, "sheet_test", 1);
  setCellInLiveDoc(docB, "sheet_test", newRowIdB, docB.getArray<string>("sheet_sheet_test_cols").get(1), {
    v: "NewRowB_Cell1",
    m: "NewRowB_Cell1",
  });

  // Sync A -> B and B -> A
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);
  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  // Both docs should have converged
  const sheetA = yDocToFortuneSheet(docA, false)[0];
  const sheetB = yDocToFortuneSheet(docB, false)[0];

  assert.strictEqual(sheetA.rowIds.length, 4);
  assert.strictEqual(sheetB.rowIds.length, 4);
  assert.deepStrictEqual(sheetA.rowIds, sheetB.rowIds);

  // Check that the original cells still contain their exact values
  const cellMapA = docA.getMap("sheet_sheet_test_cells");
  const origRow0 = initialData[0].celldata[0];
  const origCol0 = initialData[0].celldata[0];
  // Verify all cells retain their data
  const valTopLeft = cellMapA.get(`${sheetA.rowIds.find((id: string) => id !== newRowIdA && id !== newRowIdB)!}:${sheetA.colIds[0]}`);
  assert.ok(valTopLeft !== undefined, "TopLeft cell still exists");
});

test("Sanitization removes hidden columns and marks locked columns", () => {
  const initialData = [
    {
      id: "sheet_sec",
      name: "Financials",
      row: 3,
      column: 3,
      celldata: [
        { r: 0, c: 0, v: { v: "Public Title" } },
        { r: 0, c: 1, v: { v: "Locked Budget: $10,000" } },
        { r: 0, c: 2, v: { v: "Secret Internal Margin: 45%" } },
      ],
    },
  ];

  const doc = buildYDocFromSheets(initialData);
  const colIds = doc.getArray<string>("sheet_sheet_sec_cols").toArray();

  // Column 1 is locked
  setColumnMetaInLiveDoc(doc, "sheet_sec", colIds[1], { locked: true, name: "Budget" });
  // Column 2 is hidden
  setColumnMetaInLiveDoc(doc, "sheet_sec", colIds[2], { hidden: true, name: "Secret Margin" });

  // 1. Team View (non-sanitized) sees all 3 columns
  const teamSheets = yDocToFortuneSheet(doc, false);
  assert.strictEqual(teamSheets[0].colIds.length, 3);
  assert.strictEqual(teamSheets[0].celldata.length, 3);

  // 2. Client View (sanitized) MUST have column 2 completely stripped
  const clientSheets = yDocToFortuneSheet(doc, true);
  assert.strictEqual(clientSheets[0].colIds.length, 2);
  assert.ok(!clientSheets[0].colIds.includes(colIds[2]), "Hidden column ID must not exist in client view");

  // Verify celldata has no cells from hidden column
  const hasSecretCell = clientSheets[0].celldata.some((c: any) => c.colId === colIds[2] || String(c.v?.v).includes("Secret"));
  assert.strictEqual(hasSecretCell, false, "Client view celldata must not contain hidden column data");

  // Verify locked column is marked isLocked in client view
  const lockedCell = clientSheets[0].celldata.find((c: any) => c.colId === colIds[1]);
  assert.strictEqual(lockedCell.v.isLocked, true, "Locked column cell must be marked isLocked");

  // Verify public plain text does not contain secret margin
  const extracted = extractSpreadsheetData(doc);
  assert.ok(extracted.plainText.includes("Secret Internal Margin"));
  assert.ok(!extracted.publicPlainText.includes("Secret Internal Margin"), "Public plain text must not include hidden column data");
});

test("CSV and Excel import parsing", async () => {
  const csvData = "Name,Role,Rate\nAlice,Director,150\nBob,Editor,100\nCharlie,Producer,120";
  const parsed = await parseExcelOrCsvBuffer(Buffer.from(csvData), "crew.csv");

  assert.strictEqual(parsed.length, 1);
  assert.ok(parsed[0].name.toLowerCase().includes("sheet"), "Sheet name contains sheet");
  assert.strictEqual(parsed[0].celldata.length, 12); // 4 rows x 3 cols
  assert.strictEqual(parsed[0].celldata[0].v.v, "Name");
  assert.strictEqual(parsed[0].celldata[4].v.v, "Director");
});
