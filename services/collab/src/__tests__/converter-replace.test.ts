import { describe, it } from "node:test";
import assert from "node:assert";
import * as Y from "yjs";
import {
  buildYDocFromJson,
  replaceContentInLiveDoc,
  serverSchema,
} from "../prosemirror-converter.js";
import { extractDocumentData } from "../text-extractor.js";

describe("Converter & Replace Content Offline Guarantees", () => {
  it("builds initial Y.Doc state from template ProseMirror JSON", () => {
    const templateJson = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Project Brief" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Initial brief objectives" }],
        },
      ],
    };

    const doc = buildYDocFromJson(templateJson);
    const update = Y.encodeStateAsUpdate(doc);
    assert.strictEqual(update.length > 0, true);

    const extracted = extractDocumentData(doc);
    assert.match(extracted.plainText, /Project Brief/);
    assert.match(extracted.plainText, /Initial brief objectives/);
  });

  it("replaces content inside live transaction so reconnecting offline client does not resurrect old content", () => {
    // 1. Initial server document
    const serverDoc = buildYDocFromJson({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Original version content" }],
        },
      ],
    });

    // 2. Client A connects and syncs state
    const clientADoc = new Y.Doc();
    Y.applyUpdate(clientADoc, Y.encodeStateAsUpdate(serverDoc));

    // 3. Client A goes offline and makes edits to old paragraph
    const caFrag = clientADoc.getXmlFragment("default");
    const caP = caFrag.get(0) as Y.XmlElement;
    const caT = caP.get(0) as Y.XmlText;
    caT.insert(8, " (offline modification)");

    // 4. Meanwhile, someone restores an old version on server (replace content transaction)
    const restoredJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Restored Version 1 Content" }],
        },
      ],
    };
    replaceContentInLiveDoc(serverDoc, restoredJson);

    // 5. Client A comes back online and syncs both ways
    const updateFromClientA = Y.encodeStateAsUpdate(
      clientADoc,
      Y.encodeStateVector(serverDoc)
    );
    const updateFromServer = Y.encodeStateAsUpdate(
      serverDoc,
      Y.encodeStateVector(clientADoc)
    );

    Y.applyUpdate(serverDoc, updateFromClientA);
    Y.applyUpdate(clientADoc, updateFromServer);

    const sExtracted = extractDocumentData(serverDoc);
    const cExtracted = extractDocumentData(clientADoc);

    // Both server and client must show restored content and NOT resurrect the old modified text
    assert.strictEqual(sExtracted.plainText, "Restored Version 1 Content");
    assert.strictEqual(cExtracted.plainText, "Restored Version 1 Content");
    assert.doesNotMatch(sExtracted.plainText, /offline modification/);
    assert.doesNotMatch(cExtracted.plainText, /offline modification/);
  });
});
