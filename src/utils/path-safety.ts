import { isAbsolute, normalize, resolve, sep } from "node:path";

export interface PathSafetyOptions {
  rootDir: string;
}

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePathError";
  }
}

/**
 * Resolve a user-supplied relative path against rootDir, rejecting any input
 * that escapes the root via absolute paths, .. segments or NUL bytes.
 */
export function resolveOutputPath(userPath: string, options: PathSafetyOptions): string {
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new UnsafePathError("Output path must be a non-empty string");
  }
  if (userPath.includes("\x00")) {
    throw new UnsafePathError("Output path must not contain NUL bytes");
  }
  if (isAbsolute(userPath)) {
    throw new UnsafePathError(
      "Absolute paths are not allowed; provide a path relative to YOUTRACK_OUTPUT_DIR",
    );
  }

  const rootAbs = resolve(options.rootDir);
  const normalizedRel = normalize(userPath);

  if (normalizedRel.startsWith("..") || normalizedRel.split(sep).includes("..")) {
    throw new UnsafePathError("Path traversal segments (..) are not allowed");
  }

  const candidate = resolve(rootAbs, normalizedRel);

  if (candidate !== rootAbs && !candidate.startsWith(rootAbs + sep)) {
    throw new UnsafePathError("Resolved path escapes YOUTRACK_OUTPUT_DIR");
  }

  return candidate;
}

/**
 * Sanitize a filename: drop everything before the last / or \ (platform
 * independent), drop control characters, replace any non-[A-Za-z0-9._-] with
 * underscore. Returns "unnamed" if the result is empty.
 */
export function sanitizeFilename(name: string): string {
  const lastSep = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const tail = lastSep >= 0 ? name.slice(lastSep + 1) : name;
  // Control characters are intentional targets here.
  // eslint-disable-next-line no-control-regex
  const stripped = tail.replace(/[\x00-\x1f]/g, "");
  const cleaned = stripped.replace(/[^A-Za-z0-9._-]/g, "_");

  return cleaned.length > 0 ? cleaned : "unnamed";
}
