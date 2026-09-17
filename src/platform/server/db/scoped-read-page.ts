import { z } from 'zod';
import { ValidationError } from '@/platform/errors';

export type ScopedPageInput = { limit: number; cursor?: string };
const cursorSchema = z.object({ scope: z.array(z.string()), id: z.string() });

export function scopedPageCursor(input: ScopedPageInput, scope: string[]) {
  if (!input.cursor) return null;
  try {
    const parsed = cursorSchema.parse(JSON.parse(atob(input.cursor)));
    if (JSON.stringify(parsed.scope) !== JSON.stringify(scope))
      throw new Error('scope');
    return parsed.id;
  } catch {
    throw new ValidationError(
      'Invalid cursor for this collection or filter. Restart listing.'
    );
  }
}

export function scopedPage<T extends { id: string }>(
  rows: T[],
  input: ScopedPageInput,
  scope: string[]
) {
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? btoa(JSON.stringify({ scope, id: last.id }))
        : null,
  };
}
