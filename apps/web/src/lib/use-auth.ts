"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  avatar_url?: string;
  email_verified: boolean;
}

export interface CompanyDetails {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  storage_limit_bytes: number;
  storage_used_bytes: number;
  storage_reserved_bytes: number;
  verified: boolean;
}

export interface RoleDetails {
  id: string;
  name: string;
  permissions: string[];
}

export interface MeResponse {
  user: CurrentUser;
  active_company: CompanyDetails | null;
  active_role: string;
  role_id?: string;
  role_name?: string;
  permissions?: string[];
  role?: RoleDetails;
  is_client: boolean;
  companies: any[];
}

export const AUTH_QUERY_KEY = ["auth-me"];

export function clearAuthCache(queryClient: any) {
  if (queryClient && typeof queryClient.removeQueries === "function") {
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  }
}

export function useAuth() {
  const { data, isLoading, error, refetch } = useQuery<MeResponse>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => apiRequest<MeResponse>("/me"),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const user = data?.user || null;
  const company = data?.active_company || null;
  const roleName = data?.role_name || data?.active_role || data?.role?.name || "";
  const roleId = data?.role_id || data?.role?.id || "";
  const permissions = data?.permissions || data?.role?.permissions || [];
  const isClient = data?.is_client || false;

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (isClient) return false;
      const lower = roleName.toLowerCase();
      if (lower === "admin" || lower === "owner") return true;
      return permissions.includes(perm);
    },
    [isClient, roleName, permissions]
  );

  // Executive roles with full access (Shared My Drive, executive controls)
  const executiveRoles = [
    "ceo",
    "coo",
    "cfo",
    "chief sales officer",
    "design head",
    "admin",
    "owner",
  ];
  const isExecutive = !isClient && executiveRoles.includes(roleName.toLowerCase());
  const canChangeRoles = !isClient && ["ceo", "coo", "owner"].includes(roleName.toLowerCase());

  // Helper flags mapped directly to granular permissions
  const isAdmin = hasPermission("admin.settings");
  const isManager = hasPermission("team.invite") || isAdmin;
  const isEditor = !isClient && !isManager;
  const canCreateClientOrProject = hasPermission("projects.create") || hasPermission("clients.create");

  return {
    user,
    company,
    role: roleName,
    roleName,
    roleId,
    permissions,
    isClient,
    hasPermission,
    isExecutive,
    canChangeRoles,
    isAdmin,
    isManager,
    isEditor,
    canCreateClientOrProject,
    isLoading,
    error,
    refetch,
  };
}
