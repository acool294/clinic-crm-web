export { cn } from "cn"

/**
 * Format a UUID into a readable ID
 * @param prefix Prefix for the ID (e.g., 'PAT', 'APT', 'INV')
 * @param uuid The full UUID
 * @returns A formatted string like PAT-550E8400
 */
export function formatId(prefix: string, uuid: string | undefined | null): string {
  if (!uuid) return `${prefix}-UNKNOWN`;
  return `${prefix}-${uuid.split('-')[0].toUpperCase()}`;
}
