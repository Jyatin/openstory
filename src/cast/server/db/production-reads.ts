import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import {
  characters,
  sequenceLocations,
  sequenceElements,
  characterSheetVariants,
  locationSheetVariants,
} from '@/platform/server/db/schema';
import {
  readPage,
  readPageCursor,
  type ReadPageInput,
} from '@/platform/server/db/read-page';
import { createProductionAccess } from '@/sequences/server/db/production-access';

export function createCastProductionReads(db: Database, teamId: string) {
  const access = createProductionAccess(db, teamId);
  const characterQuery = () =>
    db
      .select({ character: characters, sheet: characterSheetVariants })
      .from(characters)
      .leftJoin(
        characterSheetVariants,
        and(
          eq(
            characterSheetVariants.id,
            sql`coalesce(${characters.selectedSheetVersionId}, ${characters.id})`
          ),
          eq(characterSheetVariants.characterId, characters.id)
        )
      );
  const locationQuery = () =>
    db
      .select({ location: sequenceLocations, sheet: locationSheetVariants })
      .from(sequenceLocations)
      .leftJoin(
        locationSheetVariants,
        and(
          eq(
            locationSheetVariants.id,
            sql`coalesce(${sequenceLocations.selectedReferenceVersionId}, ${sequenceLocations.id})`
          ),
          eq(locationSheetVariants.parentId, sequenceLocations.id),
          eq(locationSheetVariants.parentType, 'sequence_location')
        )
      );
  return {
    async listCharacters(input: ReadPageInput, cursorScope = '') {
      await access.sequence(input.sequenceId);
      const after = readPageCursor(input, 'characters', cursorScope);
      const rows = await characterQuery()
        .where(
          and(
            eq(characters.sequenceId, input.sequenceId),
            isNull(characters.deletedAt),
            after ? gt(characters.id, after) : undefined
          )
        )
        .orderBy(asc(characters.id))
        .limit(input.limit + 1);
      return readPage(
        rows.map((r) => ({ id: r.character.id, ...r })),
        input,
        'characters',
        cursorScope
      );
    },
    async getCharacter(sequenceId: string, id: string) {
      await access.character(sequenceId, id);
      const [row] = await characterQuery()
        .where(eq(characters.id, id))
        .limit(1);
      if (!row) throw new Error('Character disappeared during inspection');
      return row;
    },
    async listLocations(input: ReadPageInput, cursorScope = '') {
      await access.sequence(input.sequenceId);
      const after = readPageCursor(input, 'locations', cursorScope);
      const rows = await locationQuery()
        .where(
          and(
            eq(sequenceLocations.sequenceId, input.sequenceId),
            isNull(sequenceLocations.deletedAt),
            after ? gt(sequenceLocations.id, after) : undefined
          )
        )
        .orderBy(asc(sequenceLocations.id))
        .limit(input.limit + 1);
      return readPage(
        rows.map((r) => ({ id: r.location.id, ...r })),
        input,
        'locations',
        cursorScope
      );
    },
    async getLocation(sequenceId: string, id: string) {
      await access.location(sequenceId, id);
      const [row] = await locationQuery()
        .where(eq(sequenceLocations.id, id))
        .limit(1);
      if (!row) throw new Error('Location disappeared during inspection');
      return row;
    },
    async listElements(input: ReadPageInput, cursorScope = '') {
      await access.sequence(input.sequenceId);
      const after = readPageCursor(input, 'elements', cursorScope);
      return readPage(
        await db
          .select()
          .from(sequenceElements)
          .where(
            and(
              eq(sequenceElements.sequenceId, input.sequenceId),
              isNull(sequenceElements.deletedAt),
              after ? gt(sequenceElements.id, after) : undefined
            )
          )
          .orderBy(asc(sequenceElements.id))
          .limit(input.limit + 1),
        input,
        'elements',
        cursorScope
      );
    },
    getElement: access.element,
  };
}
