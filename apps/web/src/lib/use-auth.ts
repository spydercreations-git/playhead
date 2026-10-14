"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
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

export interface MeResponse {
  user: CurrentUser;
  active_company: CompanyDetails | null;
  active_role: string;
  is_client: boolean;
  companies: any[];
}

export function useAuth() {
  const { data, isLoading, error, refetch } = useQuery<MeResponse>({
    queryKey: ["auth-me"],
    queryFn: () => apiRequest<MeResponse>("/me"),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const user = data?.user || null;
  const company = data?.active_company || null;
  const role = data?.active_role || "";
  const isClient = data?.is_client || false;

  const isAdmin = role === "admin" || role === "owner";
  const isManager = role === "manager" || isAdmin;
  const isEditor = role === "editor";
  const canCreateClientOrProject = isAdmin || isManager;

  return {
    user,
    company,
    role,
    isClient,
    isAdmin,
    isManager,
    isEditor,
    canCreateClientOrProject,
    isLoading,
    error,
    refetch,
  };
}
