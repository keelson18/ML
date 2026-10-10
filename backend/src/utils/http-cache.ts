import { createHash } from 'node:crypto';

export function etagFor(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url').slice(0, 22)}"`;
}

export function matchesEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').map((value) => value.trim()).some((value) => value === etag || value === '*');
}
