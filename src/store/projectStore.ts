import { create } from "zustand";
import { ProjectSchema, type Project } from "@/core/project";
import {
  deleteAnnotationsForProject,
  deletePaperEntriesForProject,
  deleteProject as dbDeleteProject,
  getProject,
  getSettings,
  listProjects,
  putProject,
  saveSettings,
} from "@/db";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  loaded: boolean;
}

interface ProjectActions {
  load: () => Promise<void>;
  create: (name: string) => Promise<Project>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  getActiveProject: () => Project | undefined;
}

function genId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortByUpdated(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useProjectStore = create<ProjectState & ProjectActions>()(
  (set, get) => ({
    projects: [],
    activeProjectId: null,
    loaded: false,

    load: async () => {
      const [projects, settings] = await Promise.all([
        listProjects(),
        getSettings(),
      ]);
      const activeProjectId =
        settings.lastProjectId &&
        projects.some((project) => project.id === settings.lastProjectId)
          ? settings.lastProjectId
          : null;
      set({ projects: sortByUpdated(projects), activeProjectId, loaded: true });
    },

    create: async (name) => {
      const now = Date.now();
      const project = ProjectSchema.parse({
        id: genId(),
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
      });
      await putProject(project);
      set((state) => ({ projects: sortByUpdated([project, ...state.projects]) }));
      return project;
    },

    rename: async (id, name) => {
      const trimmed = name.trim();
      const existing = await getProject(id);
      if (!existing || !trimmed) {
        return;
      }
      const next: Project = { ...existing, name: trimmed, updatedAt: Date.now() };
      await putProject(next);
      set((state) => ({
        projects: sortByUpdated(
          state.projects.map((project) => (project.id === id ? next : project)),
        ),
      }));
    },

    remove: async (id) => {
      await Promise.all([
        deletePaperEntriesForProject(id),
        deleteAnnotationsForProject(id),
      ]);
      await dbDeleteProject(id);
      const wasActive = get().activeProjectId === id;
      if (wasActive) {
        await saveSettings({ lastProjectId: null });
      }
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        activeProjectId: wasActive ? null : state.activeProjectId,
      }));
    },

    setActive: async (id) => {
      await saveSettings({ lastProjectId: id });
      set({ activeProjectId: id });
    },

    getActiveProject: () => {
      const { projects, activeProjectId } = get();
      if (!activeProjectId) {
        return undefined;
      }
      return projects.find((project) => project.id === activeProjectId);
    },
  }),
);
