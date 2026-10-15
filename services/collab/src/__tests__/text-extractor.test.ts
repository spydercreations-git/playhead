import { describe, it } from "node:test";
import assert from "node:assert";
import * as Y from "yjs";
import { extractDocumentData } from "../text-extractor.js";

describe("TextExtractor & Sanitization", () => {
  it("extracts public text and strips team_notes from sanitizedContentJson and publicPlainText", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");

    // Attach elements to fragment first
    const p1 = new Y.XmlElement("paragraph");
    const teamNode = new Y.XmlElement("team_notes");
    const h1 = new Y.XmlElement("heading");
    h1.setAttribute("level", "2");
    fragment.push([p1, teamNode, h1]);

    // Insert text into p1
    const t1 = new Y.XmlText();
    p1.push([t1]);
    t1.insert(0, "Public client proposal");

    // Insert text into team_notes
    const teamP = new Y.XmlElement("paragraph");
    teamNode.push([teamP]);
    const teamT = new Y.XmlText();
    teamP.push([teamT]);
    teamT.insert(0, "CONFIDENTIAL: Internal margin target is 40%");

    // Insert text into heading
    const h1Text = new Y.XmlText();
    h1.push([h1Text]);
    h1Text.insert(0, "Scope of work");

    const result = extractDocumentData(doc);

    // 1. Plain text includes team notes
    assert.match(result.plainText, /Public client proposal/);
    assert.match(result.plainText, /CONFIDENTIAL/);
    assert.match(result.plainText, /Scope of work/);

    // 2. Public plain text must NEVER include team notes
    assert.match(result.publicPlainText, /Public client proposal/);
    assert.match(result.publicPlainText, /Scope of work/);
    assert.doesNotMatch(result.publicPlainText, /CONFIDENTIAL/);
    assert.doesNotMatch(result.publicPlainText, /Internal margin/);

    // 3. Sanitized content json must NOT have team_notes type
    const sanitizedJsonStr = JSON.stringify(result.sanitizedContentJson);
    assert.doesNotMatch(sanitizedJsonStr, /CONFIDENTIAL/);
    assert.doesNotMatch(sanitizedJsonStr, /team_notes/);

    // 4. Word count & reading time are calculated
    assert.strictEqual(result.wordCount > 0, true);
    assert.strictEqual(result.characterCount > 0, true);
    assert.strictEqual(result.readingTimeSeconds >= 60, true);
  });
});
