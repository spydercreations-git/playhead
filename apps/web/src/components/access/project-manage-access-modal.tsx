"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/lib/toast";
import { ManageAccessDialog } from "@/components/access/manage-access-dialog";

interface ProjectManageAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export function ProjectManageAccessModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: ProjectManageAccessModalProps) {
  const queryClient = useQueryClient();

  const { data: peopleData, isLoading } = useQuery<{ people: any[] }>({
    queryKey: ["project-people", projectId],
    queryFn: () => apiRequest<{ people: any[] }>(`/projects/${projectId}/people`),
    enabled: isOpen && !!projectId,
  });

  const members = (peopleData?.people || []).map((p: any) => ({
    id: p.id || p.user_id,
    name: p.name || p.email,
    email: p.email || "",
    level: p.level || "commenter",
    can_download: p.can_download ?? true,
    inherited_from: p.inherited ? (p.inherited_from || "Company") : undefined,
  }));

  const handleAddMember = async (
    email: string,
    level: string,
    canDownload: boolean,
    message?: string
  ) => {
    try {
      await apiRequest(`/projects/${projectId}/people`, {
        method: "POST",
        body: JSON.stringify({
          email,
          level,
          can_download: canDownload,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["project-people", projectId] });
      toast.success(`Access granted to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add person");
      throw err;
    }
  };

  const handleUpdateMember = async (memberId: string, level: string) => {
    try {
      await apiRequest(`/projects/${projectId}/people/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ level }),
      });
      queryClient.invalidateQueries({ queryKey: ["project-people", projectId] });
      toast.success("Access updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update access");
      throw err;
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await apiRequest(`/projects/${projectId}/people/${memberId}`, {
        method: "DELETE",
      });
      queryClient.invalidateQueries({ queryKey: ["project-people", projectId] });
      toast.success("Person removed from project");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove person");
      throw err;
    }
  };

  return (
    <ManageAccessDialog
      isOpen={isOpen}
      onClose={onClose}
      targetName={projectName}
      members={members}
      isLoading={isLoading}
      onAddMember={handleAddMember}
      onUpdateMemberLevel={handleUpdateMember}
      onRemoveMember={handleRemoveMember}
    />
  );
}
