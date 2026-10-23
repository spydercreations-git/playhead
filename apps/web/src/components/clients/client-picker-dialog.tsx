"use client";

import React from "react";
import { ArrowLeft, ChevronDown } from "@/components/ui/icon";
import { ClientAvatar } from "@/components/ui/avatar";
import { EntityPicker } from "@/components/pickers/entity-picker";

export interface ClientItem {
  id: string;
  name: string;
  website?: any;
  logo_key?: any;
  projects_count?: number;
}

export interface ClientPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClientId?: string;
  onSelectClient: (client: ClientItem | null) => void;
  title?: string;
  confirmLabel?: string;
}

/**
 * Shared Client Picker Dialog (delegates to EntityPicker P3)
 */
export function ClientPickerDialog({
  isOpen,
  onClose,
  selectedClientId,
  onSelectClient,
  title = "Choose a client",
  confirmLabel = "Continue",
}: ClientPickerDialogProps) {
  return (
    <EntityPicker
      isOpen={isOpen}
      onClose={onClose}
      tabs={["clients"]}
      mode="single"
      title={title}
      subtitle="The new project will belong to this client."
      preselectedIds={selectedClientId ? [selectedClientId] : []}
      primaryButtonText={confirmLabel}
      onConfirm={(entities) => {
        if (entities.length > 0) {
          onSelectClient(entities[0] as any);
        } else {
          onSelectClient(null);
        }
      }}
    />
  );
}

/**
 * Reusable toolbar trigger button for the Client Picker
 */
export interface ClientPickerTriggerProps {
  selectedClient?: { id: string; name: string } | null;
  onOpenPicker: () => void;
  onClearSelection: () => void;
  className?: string;
}

export function ClientPickerTrigger({
  selectedClient,
  onOpenPicker,
  onClearSelection,
  className = "",
}: ClientPickerTriggerProps) {
  if (selectedClient) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={onClearSelection}
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-2)] hover:text-white hover:border-[var(--border-strong)] transition-colors cursor-pointer"
          title="Back to all clients"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to all clients</span>
        </button>
        <button
          type="button"
          onClick={onOpenPicker}
          className="flex h-9 items-center gap-2 rounded-[10px] bg-[var(--accent)]/15 border border-[var(--accent)]/40 px-3 text-xs font-semibold text-white hover:bg-[var(--accent)]/25 transition-colors cursor-pointer"
        >
          <ClientAvatar id={selectedClient.id} name={selectedClient.name} size={16} />
          <span>{selectedClient.name}</span>
          <ChevronDown className="w-4 h-4 text-[var(--text-2)]" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenPicker}
      className={`flex h-9 items-center gap-2 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-2)] hover:text-white hover:border-[var(--border-strong)] transition-colors cursor-pointer ${className}`}
    >
      <span>Select client</span>
      <ChevronDown className="w-4 h-4 text-[var(--text-3)]" />
    </button>
  );
}
