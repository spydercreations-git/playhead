import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable";

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Collab service PostgreSQL pool error:", err);
});

export async function loadDocumentState(
  documentId: string
): Promise<Buffer | null> {
  const query = `
    SELECT content_state 
    FROM documents 
    WHERE id = $1
    LIMIT 1;
  `;
  try {
    const res = await pool.query(query, [documentId]);
    if (res.rows.length > 0 && res.rows[0].content_state) {
      return res.rows[0].content_state;
    }
    return null;
  } catch (err) {
    console.error(`Error loading document state for ${documentId}:`, err);
    return null;
  }
}

export async function saveDocumentContent(
  documentId: string,
  state: Buffer,
  contentJson: any,
  plainText: string,
  publicPlainText: string,
  wordCount: number,
  characterCount: number,
  readingTimeSeconds: number
): Promise<void> {
  const query = `
    UPDATE documents
    SET content_state = $2,
        content_json = $3::jsonb,
        plain_text = $4,
        public_plain_text = $5,
        word_count = $6,
        character_count = $7,
        reading_time_seconds = $8,
        updated_at = NOW()
    WHERE id = $1;
  `;
  try {
    await pool.query(query, [
      documentId,
      state,
      JSON.stringify(contentJson),
      plainText,
      publicPlainText,
      wordCount,
      characterCount,
      readingTimeSeconds,
    ]);
  } catch (err) {
    console.error(`Error saving document content for ${documentId}:`, err);
  }
}

export async function createDocumentVersion(
  documentId: string,
  name: string,
  isNamed: boolean,
  state: Buffer,
  contentJson: any,
  plainText: string,
  createdBy?: string
): Promise<string | null> {
  const query = `
    INSERT INTO document_versions (
      document_id,
      company_id,
      name,
      is_named,
      content_state,
      content_json,
      plain_text,
      created_by,
      created_at
    )
    SELECT
      $1,
      company_id,
      $2,
      $3,
      $4,
      $5::jsonb,
      $6,
      $7::uuid,
      NOW()
    FROM documents
    WHERE id = $1
    RETURNING id;
  `;
  try {
    const res = await pool.query(query, [
      documentId,
      name,
      isNamed,
      state,
      JSON.stringify(contentJson),
      plainText,
      createdBy || null,
    ]);
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    return null;
  } catch (err) {
    console.error(`Error creating document version for ${documentId}:`, err);
    return null;
  }
}

/**
 * Creates an "Automatic version" if edits occurred and the last version is 10 or more minutes old.
 */
export async function checkAndCreateAutomaticVersion(
  documentId: string,
  state: Buffer,
  contentJson: any,
  plainText: string
): Promise<boolean> {
  const checkQuery = `
    SELECT created_at
    FROM document_versions
    WHERE document_id = $1
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  try {
    const res = await pool.query(checkQuery, [documentId]);
    let shouldCreate = false;

    if (res.rows.length === 0) {
      // No versions exist yet
      shouldCreate = true;
    } else {
      const lastVersionTime = new Date(res.rows[0].created_at).getTime();
      const elapsedMs = Date.now() - lastVersionTime;
      // 10 minutes = 10 * 60 * 1000 ms = 600,000 ms
      if (elapsedMs >= 10 * 60 * 1000) {
        shouldCreate = true;
      }
    }

    if (shouldCreate) {
      const id = await createDocumentVersion(
        documentId,
        "Automatic version",
        false,
        state,
        contentJson,
        plainText
      );
      if (id) {
        console.log(`[Automatic Version] Created auto-version ${id} for document ${documentId}`);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error(`Error checking automatic version for ${documentId}:`, err);
    return false;
  }
}

export async function loadSpreadsheetRecord(
  spreadsheetId: string
): Promise<{ state: Buffer | null; contentJson: any | null } | null> {
  const query = `
    SELECT content_state, content_json 
    FROM spreadsheets 
    WHERE id = $1
    LIMIT 1;
  `;
  try {
    const res = await pool.query(query, [spreadsheetId]);
    if (res.rows.length > 0) {
      return {
        state: res.rows[0].content_state || null,
        contentJson: res.rows[0].content_json || null,
      };
    }
    return null;
  } catch (err) {
    console.error(`Error loading spreadsheet record for ${spreadsheetId}:`, err);
    return null;
  }
}

export async function loadSpreadsheetState(
  spreadsheetId: string
): Promise<Buffer | null> {
  const record = await loadSpreadsheetRecord(spreadsheetId);
  return record?.state || null;
}

export async function saveSpreadsheetContent(
  spreadsheetId: string,
  state: Buffer,
  contentJson: any,
  plainText: string,
  publicPlainText: string,
  rowCount: number,
  colCount: number,
  cellCount: number
): Promise<void> {
  const query = `
    UPDATE spreadsheets
    SET content_state = $2,
        content_json = $3::jsonb,
        plain_text = $4,
        public_plain_text = $5,
        row_count = $6,
        col_count = $7,
        cell_count = $8,
        updated_at = NOW()
    WHERE id = $1;
  `;
  try {
    await pool.query(query, [
      spreadsheetId,
      state,
      JSON.stringify(contentJson),
      plainText,
      publicPlainText,
      rowCount,
      colCount,
      cellCount,
    ]);
  } catch (err) {
    console.error(`Error saving spreadsheet content for ${spreadsheetId}:`, err);
  }
}

export async function createSpreadsheetVersion(
  spreadsheetId: string,
  name: string,
  isNamed: boolean,
  state: Buffer,
  contentJson: any,
  plainText: string,
  createdBy?: string
): Promise<string | null> {
  const query = `
    INSERT INTO spreadsheet_versions (
      spreadsheet_id,
      company_id,
      name,
      is_named,
      content_state,
      content_json,
      plain_text,
      created_by,
      created_at
    )
    SELECT
      $1,
      company_id,
      $2,
      $3,
      $4,
      $5::jsonb,
      $6,
      $7::uuid,
      NOW()
    FROM spreadsheets
    WHERE id = $1
    RETURNING id;
  `;
  try {
    const res = await pool.query(query, [
      spreadsheetId,
      name,
      isNamed,
      state,
      JSON.stringify(contentJson),
      plainText,
      createdBy || null,
    ]);
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    return null;
  } catch (err) {
    console.error(`Error creating spreadsheet version for ${spreadsheetId}:`, err);
    return null;
  }
}

export async function checkAndCreateAutomaticSpreadsheetVersion(
  spreadsheetId: string,
  state: Buffer,
  contentJson: any,
  plainText: string
): Promise<boolean> {
  const checkQuery = `
    SELECT created_at
    FROM spreadsheet_versions
    WHERE spreadsheet_id = $1
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  try {
    const res = await pool.query(checkQuery, [spreadsheetId]);
    let shouldCreate = false;

    if (res.rows.length === 0) {
      shouldCreate = true;
    } else {
      const lastVersionTime = new Date(res.rows[0].created_at).getTime();
      const elapsedMs = Date.now() - lastVersionTime;
      if (elapsedMs >= 10 * 60 * 1000) {
        shouldCreate = true;
      }
    }

    if (shouldCreate) {
      const id = await createSpreadsheetVersion(
        spreadsheetId,
        "Automatic version",
        false,
        state,
        contentJson,
        plainText
      );
      if (id) {
        console.log(`[Automatic Version] Created auto-version ${id} for spreadsheet ${spreadsheetId}`);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error(`Error checking automatic version for spreadsheet ${spreadsheetId}:`, err);
    return false;
  }
}
