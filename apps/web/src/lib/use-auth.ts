"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  username?: string;
  avatar?: string;
  avatar_url?: string;
  is_onboarded?: boolean;
  has_temp_password?: boolean;
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
  title?: string;
  is_admin?: boolean;
  permissions_map?: Record<string, boolean>;
  permissions?: string[];
  role?: RoleDetails;
  is_client: boolean;
  client_name?: string;
  client_logo?: string;
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
  const title = data?.title || "";
  const permissions = data?.permissions || data?.role?.permissions || [];
  const permissionsMap = data?.permissions_map || {};
  const isClient = data?.is_client || false;

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (isClient) return false;
      const lower = roleName.toLowerCase();
      if (data?.is_admin || permissionsMap["admin"] || lower === "admin" || lower === "owner") return true;
      if (permissionsMap[perm] !== undefined) return permissionsMap[perm];
      return permissions.includes(perm);
    },
    [isClient, roleName, permissions, permissionsMap, data?.is_admin]
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
  const canChangeRoles = !isClient && (data?.is_admin || permissionsMap["admin"] || ["ceo", "coo", "owner"].includes(roleName.toLowerCase()));

  // Helper flags mapped directly to granular permissions
  const isAdmin = !isClient && (data?.is_admin === true || permissionsMap["admin"] === true || hasPermission("admin.settings"));
  const isStaff = !isClient && (roleName.toLowerCase() === "staff" || isExecutive || roleName.toLowerCase() === "manager");
  const isManager = hasPermission("team.invite") || isAdmin;
  const isEditor = !isClient && !isStaff;
  const canCreateClientOrProject = hasPermission("create_project") || hasPermission("projects.create") || hasPermission("clients.create");

  const clientName = data?.client_name || "";
  const clientLogo = data?.client_logo || "";
  const isOnboarded = user ? (user.is_onboarded ?? true) : true;
  const isDriveAccessible = isExecutive;

  return {
    user,
    company,
    role: roleName,
    roleName,
    roleId,
    title,
    permissions,
    permissionsMap,
    isClient,
    clientName,
    clientLogo,
    isOnboarded,
    isDriveAccessible,
    hasPermission,
    isExecutive,
    canChangeRoles,
    isAdmin,
    isStaff,
    isManager,
    isEditor,
    canCreateClientOrProject,
    isLoading,
    error,
    refetch,
  };
}
