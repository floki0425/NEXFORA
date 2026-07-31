import type { BadgeVariant } from "@/components/ui/badge";

export {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../../lib/storage/project-files.ts";

export const FILE_VISIBILITIES = ["internal", "client"] as const;

export type FileVisibility = (typeof FILE_VISIBILITIES)[number];

export const FILE_VISIBILITY_LABELS: Record<FileVisibility, string> = {
  internal: "Internal only",
  client: "Visible to client",
};

export const FILE_VISIBILITY_BADGES: Record<FileVisibility, BadgeVariant> = {
  internal: "neutral",
  client: "accent",
};

// Freeform but bounded — matches project_files.category's length check.
export const FILE_CATEGORY_OPTIONS = [
  "Brand assets",
  "Wireframes",
  "Mockups",
  "Documentation",
  "Contracts",
  "Handover files",
  "Other",
] as const;

export const PROJECT_FILES_PAGE_SIZE = 30;

export const INTERNAL_PROJECT_FILE_ROLES = [
  "super_admin",
  "admin",
  "project_manager",
  "team_member",
] as const;
