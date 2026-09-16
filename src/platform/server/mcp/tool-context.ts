import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ulidSchema } from '@/platform/server/schemas/id.schemas';
import { NotFoundError, OpenStoryError } from '@/platform/errors';
import { getLogger, toErrorPayload } from '@/platform/logger';
import type { ScopedDb } from '@/platform/server/db/scoped';

export type ReadToolContext = { scopedDb: ScopedDb; origin: string };
export type ReadToolContextFactory = () => ReadToolContext;
export const sequenceInput = z.strictObject({
  sequenceId: ulidSchema,
});
export const pageInput = sequenceInput.extend({
  limit: z.int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
  includePrompts: z.boolean().default(false),
  includeAssets: z.boolean().default(false),
});
export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export async function requireSequence(scopedDb: ScopedDb, sequenceId: string) {
  const sequence = await scopedDb.sequences.getById(sequenceId);
  if (!sequence) throw new NotFoundError('Sequence not found.');
  return sequence;
}

/** Bound tool responses, including opt-in prompts, without silently cutting data. */
export async function readTool(
  context: ReadToolContextFactory,
  action: (
    ctx: ReadToolContext
  ) => Promise<{ data: Record<string, unknown>; summary: string }>
): Promise<CallToolResult> {
  try {
    const { data, summary } = await action(context());
    const result: CallToolResult = {
      content: [
        {
          type: 'text',
          text: summary.length > 500 ? `${summary.slice(0, 500)}…` : summary,
        },
        { type: 'text', text: JSON.stringify(data) },
      ],
      structuredContent: data,
    };
    if (new TextEncoder().encode(JSON.stringify(result)).length > 256 * 1024) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Response exceeds 256 KiB. Use list_scenes/list_shots with a smaller limit and disable includePrompts/includeAssets, or inspect individual shots.',
          },
        ],
      };
    }
    return result;
  } catch (error) {
    if (error instanceof OpenStoryError && error.statusCode < 500) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
        structuredContent: {
          error: { code: error.code, message: error.message },
        },
      };
    }
    getLogger(['openstory', 'mcp']).error('MCP read tool failed', {
      err: toErrorPayload(error),
    });
    return {
      isError: true,
      content: [
        { type: 'text', text: 'Unable to read production data. Please retry.' },
      ],
    };
  }
}
