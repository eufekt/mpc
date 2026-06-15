import { useState } from "react";
import type { ProjectMeta } from "../lib/types";

type Props = {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  onCreateProject: (name: string) => void;
  onLoadProject: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
};

export function ProjectsPanel({
  projects,
  activeProjectId,
  onCreateProject,
  onLoadProject,
  onRenameProject,
  onDeleteProject,
}: Props) {
  const [newProjectName, setNewProjectName] = useState("");

  const handleCreate = () => {
    const name = newProjectName.trim() || "Untitled";
    onCreateProject(name);
    setNewProjectName("");
  };

  const handleRename = (project: ProjectMeta) => {
    const nextName = window.prompt("Rename project", project.name);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === project.name) return;
    onRenameProject(project.id, trimmed);
  };

  const handleDelete = (project: ProjectMeta) => {
    const confirmed = window.confirm(
      `Delete project "${project.name}"? This removes its tracks, chops, audio, settings, and MIDI mappings. This cannot be undone.`,
    );
    if (!confirmed) return;
    onDeleteProject(project.id);
  };

  return (
    <section className="projects-panel">
      <div className="projects-panel-header">
        <h2>PROJECTS</h2>
      </div>

      <div className="projects-create">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="new project name"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <button type="button" onClick={handleCreate}>
          CREATE
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="hint">create a project to get started</p>
      ) : (
        <ul className="project-list">
          {projects.map((project, index) => {
            const active = project.id === activeProjectId;
            return (
              <li key={project.id} className={active ? "active" : undefined}>
                <span className="project-list-name">
                  {index + 1}. {project.name}
                  {active ? " (active)" : ""}
                </span>
                <div className="project-list-actions">
                  {!active && (
                    <button type="button" onClick={() => onLoadProject(project.id)}>
                      LOAD
                    </button>
                  )}
                  <button type="button" onClick={() => handleRename(project)}>
                    RENAME
                  </button>
                  <button type="button" onClick={() => handleDelete(project)}>
                    DEL
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
