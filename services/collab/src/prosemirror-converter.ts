import { parseHTML } from "linkedom";
import * as Y from "yjs";
import { prosemirrorJSONToYDoc, prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import { getSchema, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import LinkExtension from "@tiptap/extension-link";
import { DOMParser as PMDOMParser, Schema } from "prosemirror-model";
import mammoth from "mammoth";

// Polyfill minimal browser DOM globals required by ProseMirror DOMParser
const dom = parseHTML("<!DOCTYPE html><html><body></body></html>");
if (typeof (global as any).window === "undefined") {
  (global as any).window = dom.window;
}
if (typeof (global as any).document === "undefined") {
  (global as any).document = dom.document;
}
if (typeof (global as any).navigator === "undefined") {
  (global as any).navigator = dom.navigator;
}

// Custom nodes matching apps/web
const TeamNotes = Node.create({
  name: "team_notes",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  parseHTML() {
    return [
      { tag: "div[data-type=\"team_notes\"]" },
      { tag: "div[data-type=\"team-notes\"]" },
      { tag: "div.team-notes" },
      { tag: "team-notes" },
      { tag: "teamnotes" },
    ];
  },
  renderHTML() {
    return ["div", { "data-type": "team_notes" }, 0];
  },
});

const TeamNotesCamel = Node.create({
  name: "teamNotes",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  parseHTML() {
    return [
      { tag: "div[data-type=\"team-notes\"]" },
      { tag: "div[data-type=\"team_notes\"]" },
    ];
  },
  renderHTML() {
    return ["div", { "data-type": "team-notes" }, 0];
  },
});

const PlayheadVideoCard = Node.create({
  name: "playheadVideoCard",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      videoId: { default: null },
      title: { default: "" },
      posterUrl: { default: null },
      duration: { default: null },
      resolution: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-type=\"video-card\"]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "video-card", ...HTMLAttributes }];
  },
});

const ResizableImage = Node.create({
  name: "resizableImage",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: "100%" },
      alignment: { default: "center" },
      inTeamNotes: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-type=\"resizable-image\"]" }, { tag: "img" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", { "data-type": "resizable-image", ...HTMLAttributes }];
  },
});

export const serverSchema: Schema = getSchema([
  StarterKit.configure({
    undoRedo: false,
  }),
  Highlight,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TeamNotes,
  TeamNotesCamel,
  PlayheadVideoCard,
  ResizableImage,
]);

/**
 * Creates a brand new Y.Doc containing the given ProseMirror JSON.
 */
export function buildYDocFromJson(contentJson: any): Y.Doc {
  const ydoc = new Y.Doc();
  const frag = ydoc.getXmlFragment("default");
  if (contentJson && contentJson.type === "doc") {
    prosemirrorJSONToYXmlFragment(serverSchema, contentJson, frag);
  } else {
    prosemirrorJSONToYXmlFragment(
      serverSchema,
      { type: "doc", content: [{ type: "paragraph" }] },
      frag
    );
  }
  return ydoc;
}

/**
 * Applies new ProseMirror JSON content directly to a live Y.Doc as a transaction.
 * Deleting existing elements and inserting the new nodes ensures that:
 * 1. Connected clients see the update immediately.
 * 2. Yjs CRDT records the deletion of the old items, preventing offline clients from resurrecting old content.
 */
export function replaceContentInLiveDoc(ydoc: Y.Doc, contentJson: any): void {
  ydoc.transact(() => {
    const frag = ydoc.getXmlFragment("default");
    frag.delete(0, frag.length);
    if (contentJson && contentJson.type === "doc") {
      prosemirrorJSONToYXmlFragment(serverSchema, contentJson, frag);
    } else {
      prosemirrorJSONToYXmlFragment(
        serverSchema,
        { type: "doc", content: [{ type: "paragraph" }] },
        frag
      );
    }
  });
}

/**
 * Converts a Word (.docx) buffer on the server side using Mammoth and ProseMirror DOMParser.
 */
export async function convertDocxToProseMirror(docxBuffer: Buffer): Promise<any> {
  const result = await mammoth.convertToHtml({ buffer: docxBuffer });
  const html = result.value || "<p></p>";

  // Parse HTML into ProseMirror doc
  dom.document.body.innerHTML = html;
  const pmNode = PMDOMParser.fromSchema(serverSchema).parse(dom.document.body);
  return pmNode.toJSON();
}
