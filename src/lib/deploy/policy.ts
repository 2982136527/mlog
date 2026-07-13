const STATIC_UPLOAD_PATH_RE = /^public\/images\/uploads\//

export function requiresVercelDeployment(changedPaths: string[]): boolean {
  return changedPaths.some(path => STATIC_UPLOAD_PATH_RE.test(path))
}
