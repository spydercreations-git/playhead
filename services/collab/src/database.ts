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
