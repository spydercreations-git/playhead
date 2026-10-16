"use client";

import React from "react";
import { ProjectCard } from "@/components/cards/project-card";
import { SpreadsheetCard } from "@/components/spreadsheets/spreadsheet-card";
import { DocumentCard } from "@/components/documents/document-card";
import { FolderCard } from "@/components/cards/folder-card";

export default function CardsPreviewPage() {
  return (
    <div className="min-h-screen bg-[#181818] p-12 text-white font-sans">
      <div className="max-w-6xl mx-auto space-y-10">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">
            Playhead Card Shapes Showcase
          </h1>
          <p className="text-sm text-[#A3A6AD] mt-1">
            Exact shapes, sizes, and colors matching 11-card-shapes.svg and outline files.
          </p>
        </div>

        {/* Cards Row matching 11-card-shapes.svg layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {/* 1. Project Card (300 wide) */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-white">
              Project card (also used for folders)
            </h2>
            <div className="w-[300px]">
              <ProjectCard
                id="preview-proj"
                name="Everygen October"
                clientName="Everygen"
                videoCount={24}
                members={[
                  { id: "1", name: "Harsh", color: "#C2410C" },
                  { id: "2", name: "Rohit", color: "#7C3AED" },
                ]}
              />
            </div>
            <p className="text-[13px] text-[#A3A6AD] leading-relaxed pt-2">
              Tab: top-left, 129 wide, 18 high, corners 10, sloped right edge. Fill #26272C. Body: radius 12, fill #212121, border #2E2F34. Preview: 1 big + 2 small, 6px gap, radius 8. Hover: border #424344 and scale 1.015.
            </p>
          </div>

          {/* 2. Spreadsheet Card (232 wide) */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-white">
              Spreadsheet card
            </h2>
            <div className="w-[232px]">
              <SpreadsheetCard
                sheet={{
                  id: "preview-sheet",
                  title: "Q4 Content Calendar",
                  project_name: "Everygen",
                  author_name: "Harsh",
                  updated_at: "2026-09-30T10:00:00Z",
                  members: [
                    { id: "1", name: "Harsh", color: "#C2410C" },
                    { id: "2", name: "Rohit", color: "#7C3AED" },
                    { id: "3", name: "Kunal", color: "#0F766E" },
                  ],
                }}
              />
            </div>
            <p className="text-[13px] text-[#A3A6AD] leading-relaxed pt-2">
              Mini sheet: 150 high, radius 6. Header row: green #3FCF8E at 22%. Grid lines #2E2F34, cells grey bars. Footer: title 14, project 13, &ldquo;Harsh &middot; Sep 30&rdquo; 12, avatars, dots menu.
            </p>
          </div>

          {/* 3. Document Card (232 wide) */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-white">
              Document card
            </h2>
            <div className="w-[232px]">
              <DocumentCard
                document={{
                  id: "preview-doc",
                  title: "Everygen Brief",
                  project_name: "Everygen",
                  author_name: "Rohit",
                  updated_at: "2026-10-12T10:00:00Z",
                  members: [
                    { id: "1", name: "Harsh", color: "#C2410C" },
                    { id: "2", name: "Rohit", color: "#7C3AED" },
                    { id: "3", name: "Kunal", color: "#0F766E" },
                  ],
                }}
              />
            </div>
            <p className="text-[13px] text-[#A3A6AD] leading-relaxed pt-2">
              Page shape with folded top-right corner (28px). Fold fill #2E2F34. White paper preview, title line in blue #4876F3, grey text lines. Same footer as the sheet card.
            </p>
          </div>
        </div>

        {/* 4. Folder Card Row */}
        <div className="pt-8 border-t border-[#2E2F34] space-y-3">
          <h2 className="text-base font-semibold text-white">
            Folder Card Variant
          </h2>
          <div className="w-[300px]">
            <FolderCard
              id="preview-folder"
              name="Everygen Campaign Assets"
              itemCount={24}
              totalBytes={269558}
              isSelected={false}
              onToggleSelect={() => {}}
              onOpen={() => {}}
              onContextMenu={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
