-- AI Code Verifier — Initial Database Schema
-- This migration creates the core tables for the offline package registry
-- and CVE/advisory database.

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO schema_version (version) VALUES (1);

-- Package registry
-- Contains known packages from npm, pypi, cargo, go
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  registry TEXT NOT NULL, -- 'npm', 'pypi', 'cargo', 'go'
  latest_version TEXT,
  deprecated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (name, registry)
);

CREATE INDEX IF NOT EXISTS idx_packages_name ON packages(name);
CREATE INDEX IF NOT EXISTS idx_packages_registry ON packages(registry);

-- Security advisories (OSV format)
CREATE TABLE IF NOT EXISTS advisories (
  id TEXT PRIMARY KEY, -- OSV ID (e.g., GHSA-xxxx, CVE-xxxx)
  package_name TEXT NOT NULL,
  registry TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  cvss_score REAL,
  affected_versions TEXT, -- Version range expression
  patched_versions TEXT,  -- Version range expression
  summary TEXT NOT NULL,
  details TEXT,
  published_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (package_name, registry) REFERENCES packages(name, registry)
);

CREATE INDEX IF NOT EXISTS idx_advisories_package ON advisories(package_name, registry);
CREATE INDEX IF NOT EXISTS idx_advisories_severity ON advisories(severity);

-- API surface snapshots (for deprecated/removed API detection)
CREATE TABLE IF NOT EXISTS api_surfaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT NOT NULL,
  registry TEXT NOT NULL,
  api_name TEXT NOT NULL,     -- e.g., 'fs.exists', 'React.createClass'
  status TEXT NOT NULL,       -- 'current', 'deprecated', 'removed'
  deprecated_since TEXT,      -- Version where deprecated
  removed_since TEXT,         -- Version where removed
  replacement TEXT,           -- Suggested replacement
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_surfaces_package ON api_surfaces(package_name, registry);
CREATE INDEX IF NOT EXISTS idx_api_surfaces_name ON api_surfaces(api_name);

-- Typosquat neighbors (pre-computed Levenshtein neighbors)
CREATE TABLE IF NOT EXISTS typosquat_neighbors (
  package_name TEXT NOT NULL,
  registry TEXT NOT NULL,
  neighbor_name TEXT NOT NULL,
  distance INTEGER NOT NULL,
  PRIMARY KEY (package_name, registry, neighbor_name)
);

CREATE INDEX IF NOT EXISTS idx_typosquat_neighbor ON typosquat_neighbors(neighbor_name);

-- Update metadata
CREATE TABLE IF NOT EXISTS update_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
