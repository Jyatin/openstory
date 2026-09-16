import type { McpServer } from '@modelcontextprotocol/server';
import { sceneDetailSchema } from '@/shots/inspection.schema';
import { serializeScene } from '@/shots/server/inspection';
import { ulidSchema } from '@/platform/server/schemas/id.schemas';
import {
  readOnlyAnnotations,
  readTool,
  requireSequence,
  sequenceInput,
  type ReadToolContextFactory,
} from '../tool-context';

export function registerGetScene(
  server: McpServer,
  context: ReadToolContextFactory
) {
  server.registerTool(
    'openstory.get_scene',
    {
      description:
        'Inspect one scene by its database sceneId: selected script, continuity and up to 100 ordered shots with selected prompts/media. Use list_shots to page additional shots. Use get_shot for a shot ID.',
      inputSchema: sequenceInput.extend({ sceneId: ulidSchema }),
      outputSchema: sceneDetailSchema,
      annotations: readOnlyAnnotations,
    },
    (input) =>
      readTool(context, async ({ scopedDb, origin }) => {
        const sequence = await requireSequence(scopedDb, input.sequenceId);
        const detail = await scopedDb.scenes.getDetail(
          sequence.id,
          input.sceneId
        );
        return {
          data: {
            ...serializeScene(detail, sequence, origin, {
              includeAssets: true,
              includePrompts: true,
            }),
            script: detail.script
              ? {
                  id: detail.script.id,
                  source: detail.script.source,
                  content: detail.script.content,
                }
              : null,
            continuity: detail.scene.continuity,
            defaultModels: {
              image: sequence.imageModel,
              video: sequence.videoModel,
            },
          },
          summary: `${detail.scene.title ?? 'Scene'}: ${detail.shots.length} shots.`,
        };
      })
  );
}
