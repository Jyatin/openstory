import { z } from 'zod';
import { ValidationError } from '@/platform/errors';

export type ReadPageInput = {
  sequenceId: string;
  limit: number;
  cursor?: string;
};
const cursorSchema = z.object({ scope: z.array(z.string()), id: z.string() });

/** Keyset cursors bind the collection, parent and every membership filter. */
export function readPageCursor(input: ReadPageInput, ...scope: string[]) {
  if (!input.cursor) return null;
  try {
    const parsed = cursorSchema.parse(JSON.parse(atob(input.cursor)));
    if (
      JSON.stringify(parsed.scope) !==
      JSON.stringify([input.sequenceId, ...scope])
    )
      throw new Error('scope');
    return parsed.id;
  } catch {
    throw new ValidationError(
      'Invalid cursor for this collection or filter. Restart listing.'
    );
  }
}

export function readPage<T extends { id: string }>(
  rows: T[],
  input: ReadPageInput,
  ...scope: string[]
) {
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? btoa(
            JSON.stringify({ scope: [input.sequenceId, ...scope], id: last.id })
          )
        : null,
  };
}
