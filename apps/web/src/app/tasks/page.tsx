"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { TaskPanel } from "@/components/tasks/task-panel";
import { AssignTaskDialog } from "@/components/tasks/assign-task-dialog";
import {
  Plus,
  Search,
  ChevronDown,
  GripVertical,
  MessageSquare,
  Loader2,
  Calendar,
} from "@/components/ui/icon";
import {
  SelectClientsModal,
  ClientFilterButton,
  ClientOption,
} from "@/components/clients/select-clients-modal";

interface TaskItem {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  project_id?: string;
  project_name?: string;
  status: string;
  deadline?: string;
  deadline_label?: string;
  deadline_formatted?: string;
  is_overdue?: boolean;
  comments_count: number;
  position: any;
}

function getClientColor(clientName: string): string {
  const normalized = clientName.toLowerCase().trim();
  const colors = [
    "bg-teal-400",
    "bg-red-500",
    "bg-emerald-400",
    "bg-blue-400",
    "bg-purple-400",
    "bg-amber-400",
  ];
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
}

function TasksContent() {
  const { user, isStaff, isClient } = useAuth();
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("clients");
      if (param) return param.split(",").filter(Boolean);
    }
    return [];
  });
  const [selectedMonth, setSelectedMonth] = useState("all");

  // Modals & Panels
  const [activeTaskId, setActiveTaskId] = useState<string | null>(openParam || null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showSelectClients, setShowSelectClients] = useState(false);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleApplyClientFilter = (ids: string[]) => {
    setSelectedClientIds(ids);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (ids.length > 0) {
        url.searchParams.set("clients", ids.join(","));
      } else {
        url.searchParams.delete("clients");
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await apiRequest<{ tasks: TaskItem[] }>("/tasks");
      setTasks(res.tasks || []);
    } catch (err) {
      console.error("Failed to fetch tasks", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // Fetch clients for dropdown
    apiRequest<{ clients: ClientOption[] }>("/clients")
      .then((res) => setClients(res.clients || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (openParam) {
      setActiveTaskId(openParam);
    }
  }, [openParam]);

  // Client-side filtering
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search text filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = t.name.toLowerCase().includes(query);
        const matchesClient = t.client_name.toLowerCase().includes(query);
        if (!matchesName && !matchesClient) return false;
      }
      // Status filter
      if (selectedStatus !== "all" && t.status !== selectedStatus) {
        return false;
      }
      // Client filter
      if (selectedClientIds.length > 0 && (!t.client_id || !selectedClientIds.includes(t.client_id))) {
        return false;
      }
      // Month filter (e.g. "2026-10")
      if (selectedMonth !== "all" && t.deadline) {
        if (!t.deadline.startsWith(selectedMonth)) return false;
      }
      return true;
    });
  }, [tasks, search, selectedStatus, selectedClientIds, selectedMonth]);

  // Drag and drop handlers (Rule 10: drag rows to reorder, saved on server)
  function handleDragStart(index: number) {
    if (!isStaff) return;
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    if (!isStaff) return;
    e.preventDefault();
    setDragOverIndex(index);
  }

  async function handleDrop(e: React.DragEvent, targetIndex: number) {
    if (!isStaff || draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...filteredTasks];
    const [movedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    setTasks(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Save to server
    try {
      await apiRequest("/tasks/reorder", {
        method: "POST",
        body: JSON.stringify({ task_ids: reordered.map((t) => t.id) }),
      });
    } catch (err) {
      console.error("Failed to persist task reorder", err);
      fetchTasks();
    }
  }

  // Inline status toggle for quick updates
  async function handleQuickStatusChange(taskId: string, currentStatus: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!isStaff) return;
    const statuses = ["Not started", "In progress", "Completed", "Not needed"];
    const nextIdx = (statuses.indexOf(currentStatus) + 1) % statuses.length;
    const newStatus = statuses[nextIdx];

    try {
      await apiRequest(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch {}
  }

  return (
    <div className="flex-1 min-h-screen bg-[var(--bg)] text-white">
      <div className="w-full max-w-[1400px] mx-auto px-6 py-8 sm:px-8 sm:py-10">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Tasks</h1>
            <p className="text-xs text-[var(--text-3)] mt-1">
              Work assigned to Idyll by clients and staff.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAssignDialog(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white text-xs font-semibold shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Assign new task
          </button>
        </div>

        {/* Toolbar & Filters (T1) */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-[var(--text-3)] absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] pl-9 pr-3 py-2 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Month Dropdown */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-[var(--input)] border border-[var(--border)] rounded-[8px] pl-3 pr-8 py-2 text-xs text-white appearance-none focus:outline-none focus:border-[var(--primary)]"
            >
              <option value="all" className="bg-[var(--panel-raised)]">
                October 2026
              </option>
              <option value="all" className="bg-[var(--panel-raised)]">
                All months
              </option>
              <option value="2026-11" className="bg-[var(--panel-raised)]">
                November 2026
              </option>
              <option value="2026-09" className="bg-[var(--panel-raised)]">
                September 2026
              </option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-[var(--input)] border border-[var(--border)] rounded-[8px] pl-3 pr-8 py-2 text-xs text-white appearance-none focus:outline-none focus:border-[var(--primary)]"
            >
              <option value="all" className="bg-[var(--panel-raised)]">
                All statuses
              </option>
              <option value="Not started" className="bg-[var(--panel-raised)]">
                Not started
              </option>
              <option value="In progress" className="bg-[var(--panel-raised)]">
                In progress
              </option>
              <option value="Completed" className="bg-[var(--panel-raised)]">
                Completed
              </option>
              <option value="Not needed" className="bg-[var(--panel-raised)]">
                Not needed
              </option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Client Filter Button matching L7 & L8 */}
          {!isClient && (
            <ClientFilterButton
              selectedClientIds={selectedClientIds}
              clients={clients}
              onClick={() => setShowSelectClients(true)}
              onClearAll={() => handleApplyClientFilter([])}
            />
          )}
        </div>

        {/* Tasks List Table (T1) */}
        <div className="rounded-[10px] bg-[var(--panel)]/70 border border-[var(--border)] overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="grid grid-cols-[36px_1fr_150px_160px_60px_70px] items-center px-4 py-3 border-b border-[var(--border)] text-[12px] font-medium text-[var(--text-3)]">
            <span />
            <span>Task</span>
            <span>Status</span>
            <span>Deadline</span>
            <span />
            <span className="text-right">Action</span>
          </div>

          {/* List Rows */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-[var(--text-3)] gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
              Loading tasks...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-16 text-xs text-[var(--text-3)]">
              No tasks found.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]/60">
              {filteredTasks.map((task, index) => {
                const isOverdue = task.is_overdue;
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;

                return (
                  <div
                    key={task.id}
                    draggable={isStaff}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => setActiveTaskId(task.id)}
                    className={`grid grid-cols-[36px_1fr_150px_160px_60px_70px] items-center px-4 py-3.5 text-xs hover:bg-[var(--panel-raised)] cursor-pointer transition-colors ${
                      isDragging ? "opacity-30" : ""
                    } ${isDragOver ? "border-t-2 border-[var(--primary)]" : ""}`}
                  >
                    {/* Drag Handle */}
                    <div
                      className={`flex items-center justify-center ${
                        isStaff
                          ? "cursor-grab active:cursor-grabbing text-[var(--text-3)] hover:text-white"
                          : "opacity-0"
                      }`}
                      title={isStaff ? "Drag to reorder" : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Task Column */}
                    <div className="min-w-0 pr-4">
                      <div className="font-semibold text-white truncate text-xs">
                        {task.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[12px] text-[var(--text-3)]">
                        <span
                          className={`w-2.5 h-2.5 rounded-[2px] shrink-0 ${getClientColor(
                            task.client_name
                          )}`}
                        />
                        <span className="truncate">{task.client_name}</span>
                      </div>
                    </div>

                    {/* Status Column */}
                    <div>
                      <button
                        type="button"
                        onClick={(e) => handleQuickStatusChange(task.id, task.status, e)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          task.status === "Completed"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : task.status === "In progress"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-[var(--input)] text-[var(--text-2)]"
                        }`}
                        title={isStaff ? "Click to toggle status" : undefined}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            task.status === "Completed"
                              ? "bg-emerald-400"
                              : task.status === "In progress"
                              ? "bg-blue-400"
                              : "bg-[var(--text-3)]"
                          }`}
                        />
                        <span>{task.status}</span>
                      </button>
                    </div>

                    {/* Deadline Column */}
                    <div>
                      {task.deadline_label ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              isOverdue
                                ? "text-red-400 font-medium"
                                : task.deadline_label === "Today" ||
                                  task.deadline_label === "Tomorrow"
                                ? "text-amber-400 font-medium"
                                : "text-[var(--text-2)]"
                            }
                          >
                            {task.deadline_label}
                          </span>

                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-red-500/15 text-red-400">
                              Overdue
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--text-3)]">—</span>
                      )}
                    </div>

                    {/* Comments Count */}
                    <div className="flex items-center gap-1.5 text-[var(--text-3)] text-xs">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{task.comments_count}</span>
                    </div>

                    {/* Open Action */}
                    <div className="text-right">
                      <span className="text-xs font-semibold text-[var(--primary)] hover:underline">
                        Open
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer subtext (T1) */}
        <p className="text-[12px] text-[var(--text-3)] mt-4">
          Drag rows to set priority. Overdue is shown automatically when the deadline passes.
        </p>
      </div>

      {/* Task Panel (T2 & T3) */}
      {activeTaskId && (
        <TaskPanel
          taskId={activeTaskId}
          open={Boolean(activeTaskId)}
          onClose={() => setActiveTaskId(null)}
          onTaskUpdated={fetchTasks}
          onTaskDeleted={fetchTasks}
        />
      )}

      {/* Assign Task Dialog (T4) */}
      <AssignTaskDialog
        open={showAssignDialog}
        onClose={() => setShowAssignDialog(false)}
        onCreated={(newId) => {
          fetchTasks();
          setActiveTaskId(newId);
        }}
      />

      {/* Select Clients Modal (L7) */}
      <SelectClientsModal
        open={showSelectClients}
        onClose={() => setShowSelectClients(false)}
        selectedClientIds={selectedClientIds}
        onApply={handleApplyClientFilter}
        clients={clients}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <TasksContent />
    </Suspense>
  );
}
