import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  buildProductionStatus,
  productionStatusSchema,
} from '@/sequences/server/production-status';
import {
  readOnlyAnnotations,
  readTool,
  requireSequence,
  sequenceInput,
  type ReadToolContextFactory,
} from '../tool-context';
export function registerGetSequenceStatus(
  server: McpServer,
  context: ReadToolContextFactory
) {
  server.registerTool(
    'openstory.get_sequence_status',
    {
      description:
        'Poll production status without prompts/media. Counts measure shots (imagesFailed counts failed anchor frames); renderSegments counts unique video render units. Usable selected outputs can coexist with failed attempts. Failure details include other frame roles and are bounded to 100.',
      inputSchema: sequenceInput.extend({
        includeFailures: z.boolean().default(false),
      }),
      outputSchema: productionStatusSchema,
      annotations: readOnlyAnnotations,
    },
    ({ sequenceId, includeFailures }) =>
      readTool(context, async ({ scopedDb }) => {
        const sequence = await requireSequence(scopedDb, sequenceId);
        const data = buildProductionStatus(
          sequence,
          await scopedDb.sequences.getProductionStatus(
            sequenceId,
            includeFailures
          ),
          includeFailures
        );
        return {
          data,
          summary: `${data.status}: ${data.counts.videosReady}/${data.counts.shots} videos ready, ${data.counts.videosFailed} failed.`,
        };
      })
  );
}
