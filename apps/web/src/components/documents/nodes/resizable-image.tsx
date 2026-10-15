"use client";

import React, { useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from "lucide-react";

function ResizableImageView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected } = props;
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const width = node.attrs.width || "100%";
  const alignment = node.attrs.alignment || "center";

  function handleAlignment(align: "left" | "center" | "right") {
    updateAttributes({ alignment: align });
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    setResizing(true);

    const startX = e.clientX;
    const startWidth = containerRef.current?.offsetWidth || 400;

    function onMouseMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(150, Math.min(900, startWidth + deltaX));
      updateAttributes({ width: `${newWidth}px` });
    }

    function onMouseUp() {
      setResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const alignClass = {
    left: "mr-auto",
    center: "mx-auto",
    right: "ml-auto",
  }[alignment as "left" | "center" | "right"] || "mx-auto";

  return (
    <NodeViewWrapper className={`my-4 flex ${alignClass}`}>
      <div
        ref={containerRef}
        className={`group relative rounded-xl overflow-hidden border transition-all ${
          selected ? "ring-2 ring-primary border-primary" : "border-border/60 hover:border-border"
        }`}
        style={{ width: width, maxWidth: "100%" }}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || "Document image"}
          className="w-full h-auto object-contain block rounded-lg select-none"
          draggable={false}
        />

        {/* Floating Alignment Controls on Hover / Select */}
        <div className="absolute top-2 right-2 bg-card/95 backdrop-blur border border-border rounded-lg shadow-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={() => handleAlignment("left")}
            className={`p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              alignment === "left" ? "bg-muted text-primary" : ""
            }`}
            title="Align left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleAlignment("center")}
            className={`p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              alignment === "center" ? "bg-muted text-primary" : ""
            }`}
            title="Align center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleAlignment("right")}
            className={`p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              alignment === "right" ? "bg-muted text-primary" : ""
            }`}
            title="Align right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3.5 bg-border mx-0.5" />
          <button
            type="button"
            onClick={deleteNode}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Remove image"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Resize Handle on Right Edge */}
        <div
          onMouseDown={handleResizeStart}
          className={`absolute top-0 right-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-primary/50 transition-colors ${
            resizing ? "bg-primary" : "opacity-0 group-hover:opacity-100"
          }`}
          title="Drag to resize"
        />
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Node.create({
  name: "resizableImage",

  group: "block",

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: "100%",
      },
      alignment: {
        default: "center",
      },
      assetId: {
        default: null,
      },
      inTeamNotes: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-type="resizable-image"]',
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          return {
            src: element.getAttribute("src"),
            alt: element.getAttribute("alt"),
            width: element.getAttribute("data-width") || element.getAttribute("width"),
            alignment: element.getAttribute("data-alignment") || "center",
            assetId: element.getAttribute("data-asset-id"),
            inTeamNotes: element.getAttribute("data-in-team-notes") === "true",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-type": "resizable-image",
        "data-width": HTMLAttributes.width,
        "data-alignment": HTMLAttributes.alignment,
        "data-asset-id": HTMLAttributes.assetId,
        "data-in-team-notes": HTMLAttributes.inTeamNotes ? "true" : "false",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
