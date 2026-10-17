"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, Check, Loader2 } from "@/components/ui/icon";
import { apiRequest } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface TrackerMember {
  id: string;
  name: string;
  email: string;
  role: string;
  level: "none" | "viewer" | "editor";
}

interface TrackerAccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  targetName?: string;
}

export function TrackerAccessDialog({
  isOpen,
  onClose,
  itemId,
  targetName = "Project tracker",
}: TrackerAccessDialogProps) {
  const queryClient = useQueryClient();
  const [memberLevels, setMemberLevels] = useState<Record<string, "none" | "viewer" | "editor">>({});

  const { data, isLoading } = useQuery({
    queryKey: ["tracker-access", itemId],
    queryFn: () => apiRequest(`/items/${itemId}/tracker-access`),
    enabled: isOpen && !!itemId,
  });

  useEffect(() => {
    if (data?.members) {
      const initial: Record<string, "none" | "viewer" | "editor"> = {};
      data.members.forEach((m: TrackerMember) => {
        initial[m.id] = m.level || "none";
      });
      setMemberLevels(initial);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (grants: Array<{ user_id: string; level: string }>) =>
      apiRequest(`/items/${itemId}/tracker-access`, {
        method: "POST",
        body: JSON.stringify({ grants }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracker-access", itemId] });
      toast.success("Tracker access permissions saved");
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to update tracker permissions");
    },
  });

  const handleSave = () => {
    const grants = Object.entries(memberLevels).map(([user_id, level]) => ({
      user_id,
      level,
    }));
    updateMutation.mutate(grants);
  };

  if (!isOpen) return null;

  const members: TrackerMember[] = data?.members || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          className="relative w-full max-w-lg rounded-2xl border border-[#2E2F34] bg-[#181818] p-6 shadow-overlay z-10 flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#2E2F34]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Manage Tracker Access</h3>
                <p className="text-xs text-[#A3A6AD] truncate max-w-xs">{targetName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <div className="py-3 text-xs text-[#A3A6AD]">
            Only members with access to this project can view or edit the tracker. Configure individual member permissions below:
          </div>

          {/* Member List */}
          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 min-h-[160px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#7C7F87] gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#4876F3]" />
                <span className="text-xs">Loading project members...</span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#7C7F87]">
                No members found in this project.
              </div>
            ) : (
              members.map((member) => {
                const currentLevel = memberLevels[member.id] || "none";
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#212121] border border-[#2E2F34]/60 hover:border-[#2E2F34] transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-semibold text-white truncate">
                        {member.name || member.email}
                      </p>
                      <p className="text-xs text-[#7C7F87] truncate">{member.email}</p>
                    </div>

                    <select
                      value={currentLevel}
                      onChange={(e) =>
                        setMemberLevels((prev) => ({
                          ...prev,
                          [member.id]: e.target.value as "none" | "viewer" | "editor",
                        }))
                      }
                      className="bg-[#181818] border border-[#2E2F34] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#4876F3] cursor-pointer"
                    >
                      <option value="none">No access</option>
                      <option value="viewer">View</option>
                      <option value="editor">Edit</option>
                    </select>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 mt-2 border-t border-[#2E2F34] flex items-center justify-end gap-2.5">
            <button
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="px-3.5 py-1.5 text-xs font-medium text-[#A3A6AD] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending || isLoading}
              className="px-4 py-1.5 rounded-lg bg-[#4876F3] hover:bg-[#3560D6] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save changes</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
