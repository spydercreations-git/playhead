"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Folder, Search, Check } from "@/components/ui/icon";

export interface ProjectOption {
  id: string;
  name: string;
  client_id?: string;
  client_name?: string;
}

interface ProjectSelectProps {
  projects: ProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  allowMyDocuments?: boolean;
}

export function ProjectSelect({
  projects,
  value,
  onChange,
  placeholder = "Select a project...",
  disabled = false,
  className = "",
  allowMyDocuments = false,
}: ProjectSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pre-selected project
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === value);
  }, [projects, value]);

  // Group projects by client_name
  const groupedProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (!query) return true;
      const matchName = p.name.toLowerCase().includes(query);
      const matchClient = (p.client_name || "").toLowerCase().includes(query);
      return matchName || matchClient;
    });

    const groups: { clientName: string; items: ProjectOption[] }[] = [];
    const map = new Map<string, ProjectOption[]>();

    filtered.forEach((p) => {
      const client = p.client_name?.trim() || "Other Projects";
      if (!map.has(client)) {
        map.set(client, []);
      }
      map.get(client)!.push(p);
    });

    map.forEach((items, clientName) => {
      groups.push({ clientName, items });
    });

    return groups;
  }, [projects, searchQuery]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearchQuery("");
          }
        }}
        className={`w-full h-10 px-3 pr-9 rounded-[10px] bg-[#2A2B30] border transition-colors text-xs text-left flex items-center justify-between relative ${
          isOpen
            ? "border-[#4876F3] ring-1 ring-[#4876F3]"
            : "border-[#2E2F34] hover:border-[#424344]"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2 truncate">
          <Folder className={`w-3.5 h-3.5 shrink-0 ${allowMyDocuments && !value ? "text-[#4876F3]" : "text-[#7C7F87]"}`} />
          {selectedProject ? (
            <span className="truncate text-white">
              {selectedProject.name}{" "}
              {selectedProject.client_name ? (
                <span className="text-[#7C7F87] font-normal">
                  ({selectedProject.client_name})
                </span>
              ) : null}
            </span>
          ) : allowMyDocuments && !value ? (
            <span className="truncate text-white font-medium">My documents (private to me)</span>
          ) : (
            <span className="text-[#7C7F87]">{placeholder}</span>
          )}
        </div>

        {/* Custom ChevronDown icon 14px placed 12px from right edge */}
        <ChevronDown
          className={`w-[14px] h-[14px] text-[#7C7F87] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-150 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-[10px] bg-[#212121] border border-[#2E2F34] shadow-overlay py-2 max-h-64 flex flex-col">
          {/* Search Input */}
          <div className="px-2 pb-2 border-b border-[#2E2F34]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7C7F87] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-[8px] bg-[#2A2B30] border border-[#2E2F34] text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
              />
            </div>
          </div>

          {/* Grouped Options List */}
          <div className="overflow-y-auto flex-1 py-1">
            {allowMyDocuments && (!searchQuery || "my documents".includes(searchQuery.toLowerCase())) && (
              <div className="px-2 pb-1 mb-1 border-b border-[#2E2F34]">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-[6px] text-left text-xs flex items-center justify-between hover:bg-[#2C2D33] transition-colors ${
                    !value ? "bg-[#4876F3]/10 text-white font-medium" : "text-[#A3A6AD]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className="w-3.5 h-3.5 text-[#4876F3] shrink-0" />
                    <span className="truncate">My documents (private to me)</span>
                  </div>
                  {!value && <Check className="w-3.5 h-3.5 text-[#4876F3] shrink-0" />}
                </button>
              </div>
            )}
            {groupedProjects.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[#7C7F87]">
                No projects found
              </div>
            ) : (
              groupedProjects.map((group) => (
                <div key={group.clientName} className="mb-2 last:mb-0">
                  <div className="px-3 py-1 text-[13px] font-medium text-[#A3A6AD]">
                    {group.clientName}
                  </div>
                  {group.items.map((project) => {
                    const isSelected = project.id === value;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          onChange(project.id);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-[#2C2D33] transition-colors ${
                          isSelected ? "bg-[#4876F3]/10 text-white font-medium" : "text-[#A3A6AD]"
                        }`}
                      >
                        <span className="truncate">{project.name}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[#4876F3] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
