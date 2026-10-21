import DOMPurify from "dompurify";

/**
 * Client-side secondary layer HTML sanitizer using DOMPurify.
 * Restricts to the exact tags and attributes supported by Playhead editors.
 */
export function sanitizeClientHTML(dirty: string): string {
  if (!dirty) return "";
  if (typeof window === "undefined") {
    return dirty;
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p",
      "h1",
      "h2",
      "h3",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "del",
      "code",
      "pre",
      "blockquote",
      "hr",
      "ul",
      "ol",
      "li",
      "br",
      "mark",
      "span",
      "a",
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "class",
      "title",
      "data-type",
      "data-id",
      "data-label",
      "data-href",
      "data-alignment",
      "data-item-id",
      "data-document-id",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ["target"],
  });
}
