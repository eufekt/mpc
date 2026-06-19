import type { ProjectMeta, ProjectsIndex } from "./types";

const PROJECTS_INDEX_KEY = "mpc-projects";
const LEGACY_META_KEY = "mpc-session";

export function createProjectId(): string {
  return crypto.randomUUID();
}

export function sessionMetaKey(projectId: string): string {
  return `mpc-session-${projectId}`;
}

export function loadProjectsIndex(): ProjectsIndex {
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (!raw) return { activeProjectId: null, projects: [] };
    const parsed = JSON.parse(raw) as Partial<ProjectsIndex>;
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.filter(
          (project): project is ProjectMeta =>
            typeof project?.id === "string" &&
            typeof project?.name === "string" &&
            typeof project?.updatedAt === "number",
        )
      : [];
    const activeProjectId =
      typeof parsed.activeProjectId === "string" &&
      projects.some((project) => project.id === parsed.activeProjectId)
        ? parsed.activeProjectId
        : (projects[0]?.id ?? null);
    return { activeProjectId, projects };
  } catch {
    return { activeProjectId: null, projects: [] };
  }
}

export function saveProjectsIndex(index: ProjectsIndex): void {
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
}

export function touchProject(index: ProjectsIndex, projectId: string): ProjectsIndex {
  const next: ProjectsIndex = {
    ...index,
    projects: index.projects.map((project) =>
      project.id === projectId
        ? { ...project, updatedAt: Date.now() }
        : project,
    ),
  };
  saveProjectsIndex(next);
  return next;
}

export function addProject(index: ProjectsIndex, project: ProjectMeta): ProjectsIndex {
  const next: ProjectsIndex = {
    activeProjectId: project.id,
    projects: [...index.projects, project],
  };
  saveProjectsIndex(next);
  return next;
}

export function renameProjectInIndex(
  index: ProjectsIndex,
  projectId: string,
  name: string,
): ProjectsIndex {
  const trimmed = name.trim();
  if (!trimmed) return index;
  const next: ProjectsIndex = {
    ...index,
    projects: index.projects.map((project) =>
      project.id === projectId
        ? { ...project, name: trimmed, updatedAt: Date.now() }
        : project,
    ),
  };
  saveProjectsIndex(next);
  return next;
}

export function removeProjectFromIndex(
  index: ProjectsIndex,
  projectId: string,
): ProjectsIndex {
  const projects = index.projects.filter((project) => project.id !== projectId);
  const activeProjectId =
    index.activeProjectId === projectId
      ? (projects[0]?.id ?? null)
      : index.activeProjectId;
  const next: ProjectsIndex = { activeProjectId, projects };
  saveProjectsIndex(next);
  return next;
}

export function setActiveProjectInIndex(
  index: ProjectsIndex,
  projectId: string,
): ProjectsIndex {
  if (!index.projects.some((project) => project.id === projectId)) return index;
  const next: ProjectsIndex = { ...index, activeProjectId: projectId };
  saveProjectsIndex(next);
  return next;
}

export function createDefaultProject(name = "Untitled"): ProjectMeta {
  return {
    id: createProjectId(),
    name,
    updatedAt: Date.now(),
  };
}

/** Ensures at least one project exists; migrates legacy single-session storage if needed. */
export function ensureProjectsInitialized(): ProjectsIndex {
  const existing = loadProjectsIndex();
  if (existing.projects.length > 0) return existing;

  const legacyMeta = localStorage.getItem(LEGACY_META_KEY);
  if (legacyMeta) {
    const project = createDefaultProject("Untitled");
    localStorage.setItem(sessionMetaKey(project.id), legacyMeta);
    localStorage.removeItem(LEGACY_META_KEY);

    const legacyMidi = localStorage.getItem("mpc-midi-bindings");
    if (legacyMidi) {
      localStorage.setItem(`mpc-midi-bindings-${project.id}`, legacyMidi);
      localStorage.removeItem("mpc-midi-bindings");
    }

    const next: ProjectsIndex = {
      activeProjectId: project.id,
      projects: [project],
    };
    saveProjectsIndex(next);
    return next;
  }

  const project = createDefaultProject();
  const next: ProjectsIndex = {
    activeProjectId: project.id,
    projects: [project],
  };
  saveProjectsIndex(next);
  return next;
}
