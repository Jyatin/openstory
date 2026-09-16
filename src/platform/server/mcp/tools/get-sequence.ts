import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  buildSequenceSummary,
  sequenceSummarySchema,
} from '@/platform/server/api-v1/state';
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
export function registerGetSequence(
  server: McpServer,
  context: ReadToolContextFactory
) {
  server.registerTool(
    'openstory.get_sequence',
    {
      description:
        'Get compact sequence summary, selected-output counts, model defaults, style and media links. Use list_scenes/list_shots for contents and get_sequence_status for failure details.',
      inputSchema: sequenceInput,
      outputSchema: sequenceSummarySchema.extend({
        status: z.string(),
        sequenceStatus: z.string(),
        counts: productionStatusSchema.shape.counts,
      }),
      annotations: readOnlyAnnotations,
    },
    ({ sequenceId }) =>
      readTool(context, async ({ scopedDb, origin }) => {
        const sequence = await requireSequence(scopedDb, sequenceId);
        const [style, read] = await Promise.all([
          scopedDb.styles.getById(sequence.styleId),
          scopedDb.sequences.getProductionStatus(sequenceId, false),
        ]);
        const status = buildProductionStatus(sequence, read, false);
        return {
          data: {
            ...buildSequenceSummary({
              sequence,
              style,
              counts: status.counts,
              origin,
            }),
            status: status.status,
            sequenceStatus: sequence.status,
            counts: status.counts,
          },
          summary: `${sequence.title}: ${status.status}; ${status.counts.shots} shots.`,
        };
      })
  );
}
