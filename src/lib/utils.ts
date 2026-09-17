export { cn } from "cn";

/**
 * Format a UUID into a readable ID
 * @param prefix Prefix for the ID (e.g., 'PAT', 'APT', 'INV')
 * @param uuid The full UUID
 * @returns A formatted string like pt_550e8400
 */
export function formatId(prefix: string, uuid: string | undefined | null): string {
  const pfx = prefix === 'PAT' ? 'pt' : prefix === 'CLN' ? 'cln' : prefix === 'APT' ? 'apt' : prefix === 'INV' ? 'inv' : prefix.toLowerCase();
  if (!uuid) return pfx + '_unknown';
  return pfx + '_' + String(uuid).split('-')[0].toLowerCase();
}
