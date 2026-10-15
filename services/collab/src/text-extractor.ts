import * as Y from "yjs";

export interface ExtractedDocumentData {
  contentJson: any;
  sanitizedContentJson: any;
  plainText: string;
  publicPlainText: string;
  wordCount: number;
  characterCount: number;
  readingTimeSeconds: number;
}

function isTeamNotesNode(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "team_notes" || lower === "teamnotes";
}

function xmlElementToProseMirror(element: Y.XmlElement, sanitizeTeamNotes: boolean): any | null {
  const nodeType = element.nodeName;
  if (sanitizeTeamNotes && isTeamNotesNode(nodeType)) {
    return null;
  }

  const attrs = element.getAttributes();
  const children: any[] = [];

  const childrenArray = element.toArray();
  for (const child of childrenArray) {
    if (child instanceof Y.XmlElement) {
      const converted = xmlElementToProseMirror(child, sanitizeTeamNotes);
      if (converted) {
        children.push(converted);
      }
    } else if (child instanceof Y.XmlText) {
      const deltas = child.toDelta();
      for (const delta of deltas) {
        if (typeof delta.insert === "string" && delta.insert.length > 0) {
          const textNode: any = {
            type: "text",
            text: delta.insert,
          };
          if (delta.attributes && Object.keys(delta.attributes).length > 0) {
            textNode.marks = Object.entries(delta.attributes).map(([markType, markAttrs]) => ({
              type: markType,
              attrs: typeof markAttrs === "object" ? markAttrs : undefined,
            }));
          }
          children.push(textNode);
        }
      }
    }
  }

  const result: any = {
    type: nodeType,
  };
  if (Object.keys(attrs).length > 0) {
    result.attrs = attrs;
  }
  if (children.length > 0) {
    result.content = children;
  }
  return result;
}

function extractText(element: Y.XmlFragment | Y.XmlElement, skipTeamNotes: boolean): string {
  let text = "";
  const children = element.toArray();
  for (const child of children) {
    if (child instanceof Y.XmlElement) {
      if (skipTeamNotes && isTeamNotesNode(child.nodeName)) {
        continue;
      }
      const childText = extractText(child, skipTeamNotes);
      if (childText) {
        text += childText + " ";
      }
    } else if (child instanceof Y.XmlText) {
      text += child.toString() + " ";
    }
  }
  return text.trim();
}

export function extractDocumentData(doc: Y.Doc): ExtractedDocumentData {
  const fragment = doc.getXmlFragment("default");

  const fullContent: any[] = [];
  const sanitizedContent: any[] = [];

  const children = fragment.toArray();
  for (const child of children) {
    if (child instanceof Y.XmlElement) {
      const fullNode = xmlElementToProseMirror(child, false);
      if (fullNode) {
        fullContent.push(fullNode);
      }
      const sanitizedNode = xmlElementToProseMirror(child, true);
      if (sanitizedNode) {
        sanitizedContent.push(sanitizedNode);
      }
    } else if (child instanceof Y.XmlText) {
      const deltas = child.toDelta();
      for (const delta of deltas) {
        if (typeof delta.insert === "string" && delta.insert.length > 0) {
          fullContent.push({ type: "text", text: delta.insert });
          sanitizedContent.push({ type: "text", text: delta.insert });
        }
      }
    }
  }

  const contentJson = {
    type: "doc",
    content: fullContent,
  };

  const sanitizedContentJson = {
    type: "doc",
    content: sanitizedContent,
  };

  const plainText = extractText(fragment, false);
  const publicPlainText = extractText(fragment, true);

  const words = plainText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const characterCount = plainText.length;
  const readingTimeSeconds = Math.max(1, Math.ceil(wordCount / 200) * 60);

  return {
    contentJson,
    sanitizedContentJson,
    plainText,
    publicPlainText,
    wordCount,
    characterCount,
    readingTimeSeconds,
  };
}
