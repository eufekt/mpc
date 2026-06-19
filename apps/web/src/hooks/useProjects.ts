import { useCallback, useState } from "react";
import {
  addProject,
  createDefaultProject,
  ensureProjectsInitialized,
  loadProjectsIndex,
  removeProjectFromIndex,
  renameProjectInIndex,
  setActiveProjectInIndex,
} from "../lib/projectPersistence";
import { deleteProjectStorage } from "../lib/sessionPersistence";
import type { ProjectMeta, ProjectsIndex } from "../lib/types";

export function useProjects() {
  const [index, setIndex] = useState<ProjectsIndex>(() =>
    ensureProjectsInitialized(),
  );

  const refreshIndex = useCallback(() => {
    setIndex(loadProjectsIndex());
  }, []);

  const activeProject =
    index.projects.find((project) => project.id === index.activeProjectId) ??
    null;

  const createProject = useCallback(
    (name: string) => {
      const project = createDefaultProject(name.trim() || "Untitled");
      const next = addProject(index, project);
      setIndex(next);
      return project;
    },
    [index],
  );

  const renameProject = useCallback(
    (projectId: string, name: string) => {
      const next = renameProjectInIndex(index, projectId, name);
      setIndex(next);
    },
    [index],
  );

  const selectProject = useCallback(
    (projectId: string) => {
      const next = setActiveProjectInIndex(index, projectId);
      setIndex(next);
    },
    [index],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      await deleteProjectStorage(projectId);
      let next = removeProjectFromIndex(index, projectId);
      if (next.projects.length === 0) {
        const project = createDefaultProject();
        next = addProject(next, project);
      }
      setIndex(next);
      return next;
    },
    [index],
  );

  return {
    projects: index.projects,
    activeProjectId: index.activeProjectId,
    activeProject,
    createProject,
    renameProject,
    selectProject,
    deleteProject,
    refreshIndex,
  };
}

export type { ProjectMeta };
