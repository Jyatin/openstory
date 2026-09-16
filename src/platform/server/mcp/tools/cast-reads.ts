import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ulidSchema } from '@/platform/server/schemas/id.schemas';
import {
  characterReadSchema,
  locationReadSchema,
  elementReadSchema,
  inspectCharacter,
  inspectLocation,
  inspectElement,
} from '@/cast/server/production-inspection';
import {
  registerProductionRead,
  collectionInput,
  sequenceInput,
  requireSequence,
  type ReadToolContextFactory,
} from '../tool-context';

export function registerCastReads(
  server: McpServer,
  context: ReadToolContextFactory
) {
  registerProductionRead(
    server,
    context,
    'list_characters',
    'Page sequence characters by database ID, including selected reference sheets and voice assignments. Continue using nextCursor.',
    collectionInput,
    z.object({
      characters: z.array(characterReadSchema),
      nextCursor: z.string().nullable(),
    }),
    async (input, { scopedDb, origin }) => {
      const sequence = await requireSequence(scopedDb, input.sequenceId);
      const page = await scopedDb.castReads.listCharacters(input);
      return {
        characters: page.items.map((row) =>
          inspectCharacter(row, sequence.generateVoices, origin)
        ),
        nextCursor: page.nextCursor,
      };
    }
  );
  registerProductionRead(
    server,
    context,
    'get_character',
    'Inspect a sequence character by database characterId, including appearance, performance, voice takes, first mention and selected sheet. characterId is not an analysis label or talent library ID.',
    sequenceInput.extend({ characterId: ulidSchema }),
    z.object({ character: characterReadSchema }),
    async (input, { scopedDb, origin }) => {
      const sequence = await requireSequence(scopedDb, input.sequenceId);
      return {
        character: inspectCharacter(
          await scopedDb.castReads.getCharacter(
            input.sequenceId,
            input.characterId
          ),
          sequence.generateVoices,
          origin
        ),
      };
    }
  );
  registerProductionRead(
    server,
    context,
    'list_locations',
    'Page sequence locations by database ID with design details and selected references. Continue using nextCursor.',
    collectionInput,
    z.object({
      locations: z.array(locationReadSchema),
      nextCursor: z.string().nullable(),
    }),
    async (input, { scopedDb, origin }) => {
      const page = await scopedDb.castReads.listLocations(input);
      return {
        locations: page.items.map((row) => inspectLocation(row, origin)),
        nextCursor: page.nextCursor,
      };
    }
  );
  registerProductionRead(
    server,
    context,
    'get_location',
    'Inspect a sequence location by database locationId, including lighting, environment, first mention and selected reference. This is not a library location ID or analysis label.',
    sequenceInput.extend({ locationId: ulidSchema }),
    z.object({ location: locationReadSchema }),
    async (input, { scopedDb, origin }) => ({
      location: inspectLocation(
        await scopedDb.castReads.getLocation(
          input.sequenceId,
          input.locationId
        ),
        origin
      ),
    })
  );
  registerProductionRead(
    server,
    context,
    'list_elements',
    'Page sequence image, video and audio elements by database ID, including script tokens and media URLs. Continue using nextCursor.',
    collectionInput,
    z.object({
      elements: z.array(elementReadSchema),
      nextCursor: z.string().nullable(),
    }),
    async (input, { scopedDb, origin }) => {
      const page = await scopedDb.castReads.listElements(input);
      return {
        elements: page.items.map((row) => inspectElement(row, origin)),
        nextCursor: page.nextCursor,
      };
    }
  );
  registerProductionRead(
    server,
    context,
    'get_element',
    'Inspect a sequence element by database elementId, including its token, description, media kind, duration and analysis status.',
    sequenceInput.extend({ elementId: ulidSchema }),
    z.object({ element: elementReadSchema }),
    async (input, { scopedDb, origin }) => ({
      element: inspectElement(
        await scopedDb.castReads.getElement(input.sequenceId, input.elementId),
        origin
      ),
    })
  );
}
