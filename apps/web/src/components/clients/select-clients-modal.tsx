"use client";

import React, { useMemo } from "react";
import { Users, ChevronDown } from "@/components/ui/icon";
import { ClientAvatar } from "@/components/ui/avatar";
import { EntityPicker } from "@/components/pickers/entity-picker";

export interface ClientOption {
  id: string;
  name: string;
  logo_key?: string | null;
  projects_count?: number;
  [key: string]: any;
}

export const CLIENT_COLORS = [
  "#4876f3", // Blue
  "#3fcf8e", // Green
  "#9787ff", // Purple
  "#ffbb56", // Orange
  "#4dd0e1", // Cyan
  "#fa457b", // Pink
  "#ffd43b", // Amber
  "#ba68c8", // Magenta
  "#0e7490", // Teal
  "#7c3aed", // Violet
];

export function getClientColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CLIENT_COLORS[Math.abs(hash) % CLIENT_COLORS.length];
}

export interface SelectClientsModalProps {
  open: boolean;
  onClose: () => void;
  selectedClientIds: string[];
  onApply: (clientIds: string[]) => void;
  clients?: ClientOption[];
}

/**
 * Unified Select Clients Modal (delegates to shared EntityPicker P1)
 */
export function SelectClientsModal({
  open,
  onClose,
  selectedClientIds,
  onApply,
}: SelectClientsModalProps) {
  return (
    <EntityPicker
      isOpen={open}
      onClose={onClose}
      tabs={["clients"]}
      mode="multi"
      title="Select clients"
      subtitle="Show projects from one, several or all clients."
      showAll
      preselectedIds={selectedClientIds}
      primaryButtonText={(count) =>
        count > 0 ? `Show ${count} ${count === 1 ? "client" : "clients"}` : "Show all clients"
      }
      onConfirm={(_, ids) => onApply(ids)}
    />
  );
}

export interface ClientFilterButtonProps {
  selectedClientIds: string[];
  clients: ClientOption[];
  onClick: () => void;
  onClearAll?: () => void;
  className?: string;
}

/**
 * The Filter Button for Library / Tasks / Documents matching Screenshot L8
 */
export function ClientFilterButton({
  selectedClientIds,
  clients,
  onClick,
  onClearAll,
  className = "",
}: ClientFilterButtonProps) {
  const isFiltered = selectedClientIds.length > 0 && selectedClientIds.length < clients.length;

  const selectedClients = useMemo(() => {
    return clients.filter((c) => selectedClientIds.includes(c.id));
  }, [clients, selectedClientIds]);

  const buttonLabel = useMemo(() => {
    if (!isFiltered) {
      return "All clients";
    }

    if (selectedClients.length === 0) return "All clients";

    if (selectedClients.length === 1) {
      return selectedClients[0].name;
    }

    if (selectedClients.length === 2) {
      return `${selectedClients[0].name}, ${selectedClients[1].name}`;
    }

    return `${selectedClients[0].name}, ${selectedClients[1].name} +${selectedClients.length - 2}`;
  }, [isFiltered, selectedClients]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="h-9 rounded-[10px] bg-[var(--input)] border border-[var(--border)] hover:border-[var(--border-strong)] px-3 flex items-center gap-2 text-xs text-white transition-colors cursor-pointer select-none"
      >
        {isFiltered && selectedClients.length === 1 ? (
          <ClientAvatar
            id={selectedClients[0].id}
            name={selectedClients[0].name}
            size={16}
          />
        ) : (
          <Users size={16} className="text-white shrink-0" />
        )}
        <span className="font-medium truncate max-w-[280px]">{buttonLabel}</span>
        {isFiltered && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-white text-xs font-semibold inline-flex items-center justify-center leading-none tabular-nums shrink-0">
            {selectedClientIds.length}
          </span>
        )}
        <ChevronDown size={16} className="text-[var(--text-3)] shrink-0" />
      </button>

      {isFiltered && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer transition-colors"
        >
          Show all clients
        </button>
      )}
    </div>
  );
}
