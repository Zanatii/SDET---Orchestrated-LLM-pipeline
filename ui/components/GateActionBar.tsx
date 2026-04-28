"use client";

import { useEffect, useRef, useState } from "react";

interface GateActionBarProps {
  gate: string;
  editMode: boolean;
  onEditModeToggle: () => void;
  onApprove: (projectName?: string) => void;
  onReject: (feedback: string) => void;
}

export default function GateActionBar({
  gate,
  editMode,
  onEditModeToggle,
  onApprove,
  onReject,
}: GateActionBarProps) {
  const [showReject, setShowReject] = useState(false);
  const [rejectText, setRejectText] = useState("");

  // review_scripts gate — project name input + autocomplete
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [projectNameWarning, setProjectNameWarning] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isScriptsGate = gate === "review_scripts";

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } catch {
      // non-fatal — autocomplete is best-effort
    }
  }

  // Fetch + open dropdown when ≥2 chars are typed
  useEffect(() => {
    if (!isScriptsGate) return;
    if (projectName.length >= 2) {
      fetchProjects();
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [projectName, isScriptsGate]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.toLowerCase().includes(projectName.toLowerCase())
  );
  const isExistingProject = projectName.length > 0 && projects.includes(projectName);
  const isNewProject = projectName.length > 0 && !projects.includes(projectName);

  function handleRejectConfirm() {
    onReject(rejectText);
    setShowReject(false);
    setRejectText("");
  }

  function handleApproveClick() {
    if (isScriptsGate && !projectName.trim()) {
      setProjectNameWarning(
        "No project name entered — scripts will be saved under default"
      );
    } else {
      setProjectNameWarning("");
    }
    onApprove(isScriptsGate ? projectName.trim() || undefined : undefined);
  }

  const gateLabel = gate
    .replace(/^review_/, "")
    .replace(/_/g, " ")
    .toUpperCase();

  return (
    <div className="shrink-0 border-t border-border bg-surface">
      {showReject ? (
        <div className="flex flex-col gap-3 px-6 py-4">
          <label className="text-sm text-muted font-medium">
            Reject reason — this feedback will be stored and injected into future runs:
          </label>
          <textarea
            className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-teal resize-none"
            rows={3}
            placeholder="Describe what was wrong and how to improve..."
            value={rejectText}
            onChange={(e) => setRejectText(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowReject(false); setRejectText(""); }}
              className="px-4 py-1.5 text-sm text-muted border border-border rounded-md hover:border-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRejectConfirm}
              disabled={!rejectText.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-red rounded-md disabled:opacity-40 hover:bg-red/80 transition-colors"
            >
              Confirm Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Project name input — only at review_scripts gate */}
          {isScriptsGate && (
            <div className="px-6 pt-4 pb-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Project Name</label>
              <div className="relative w-full max-w-sm" ref={dropdownRef}>
                <input
                  type="text"
                  className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-teal transition-colors"
                  placeholder="e.g. dubai-justice-portal"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value);
                    setProjectNameWarning("");
                  }}
                  onFocus={() => {
                    fetchProjects();
                    if (projectName.length >= 2) setShowDropdown(true);
                  }}
                />
                {/* Autocomplete dropdown */}
                {showDropdown && filteredProjects.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-surface border border-border rounded-md shadow-lg overflow-hidden">
                    {filteredProjects.map((p) => (
                      <button
                        key={p}
                        className="w-full text-left px-3 py-2 text-sm text-text hover:bg-teal/10 transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep input focused until selection completes
                          setProjectName(p);
                          setShowDropdown(false);
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status badge */}
              {isExistingProject && (
                <span className="text-xs font-medium text-teal">
                  ✓ Existing project — scripts will be appended
                </span>
              )}
              {isNewProject && (
                <span className="text-xs font-medium text-sky-400">
                  + New project will be created
                </span>
              )}

              {/* Empty-name warning */}
              {projectNameWarning && (
                <span className="text-xs text-amber-400">{projectNameWarning}</span>
              )}
            </div>
          )}

          {/* Main action row */}
          <div className="flex items-center justify-between px-6 py-3 gap-4">
            <span className="text-xs font-mono text-muted tracking-widest">
              AWAITING REVIEW · {gateLabel}
            </span>

            <div className="flex items-center gap-2">
              {/* Edit mode toggle */}
              <button
                onClick={onEditModeToggle}
                title={editMode ? "Exit edit mode" : "Enter edit mode to modify items"}
                className={`p-2 rounded-md border transition-colors ${
                  editMode
                    ? "border-teal text-teal bg-teal/10"
                    : "border-border text-muted hover:border-text hover:text-text"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>

              <button
                onClick={() => setShowReject(true)}
                className="px-5 py-2 text-sm font-medium text-white bg-red/80 rounded-md hover:bg-red transition-colors"
              >
                Reject
              </button>

              <button
                onClick={handleApproveClick}
                className="px-5 py-2 text-sm font-medium text-white bg-green rounded-md hover:bg-green/80 transition-colors"
              >
                {editMode ? "Approve with edits" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
