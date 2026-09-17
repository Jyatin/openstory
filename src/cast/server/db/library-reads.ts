import { and, asc, eq, gt, or } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import {
  talent,
  locationLibrary,
  talentSheets,
  talentMedia,
  talentSheetVariants,
  locationSheets,
  locationSheetVariants,
} from '@/platform/server/db/schema';
import { NotFoundError } from '@/platform/errors';
import {
  scopedPageCursor,
  scopedPage,
  type ScopedPageInput,
} from '@/platform/server/db/scoped-read-page';

export type LibraryReadKind =
  | 'talent'
  | 'location'
  | 'talent_sheet'
  | 'talent_media'
  | 'talent_sheet_version'
  | 'location_sheet'
  | 'location_sheet_version';

export function createCastLibraryReads(db: Database, teamId: string) {
  async function get(kind: LibraryReadKind, id: string, parentId = '') {
    switch (kind) {
      case 'talent': {
        const rows = await db
          .select()
          .from(talent)
          .where(
            and(
              or(eq(talent.teamId, teamId), eq(talent.isPublic, true)),
              eq(talent.id, id)
            )
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'location': {
        const rows = await db
          .select()
          .from(locationLibrary)
          .where(
            and(
              or(
                eq(locationLibrary.teamId, teamId),
                eq(locationLibrary.isPublic, true)
              ),
              eq(locationLibrary.id, id)
            )
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'talent_sheet': {
        await get('talent', parentId);
        const rows = await db
          .select()
          .from(talentSheets)
          .where(
            and(eq(talentSheets.talentId, parentId), eq(talentSheets.id, id))
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'talent_media': {
        await get('talent', parentId);
        const rows = await db
          .select()
          .from(talentMedia)
          .where(
            and(eq(talentMedia.talentId, parentId), eq(talentMedia.id, id))
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'talent_sheet_version': {
        const sheet = await db
          .select()
          .from(talentSheets)
          .where(eq(talentSheets.id, parentId))
          .limit(1);
        if (!sheet[0]) throw new NotFoundError('Talent sheet not found.');
        await get('talent', sheet[0].talentId);
        const rows = await db
          .select()
          .from(talentSheetVariants)
          .where(
            and(
              eq(talentSheetVariants.talentSheetId, parentId),
              eq(talentSheetVariants.id, id)
            )
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'location_sheet': {
        await get('location', parentId);
        const rows = await db
          .select()
          .from(locationSheets)
          .where(
            and(
              eq(locationSheets.locationId, parentId),
              eq(locationSheets.id, id)
            )
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'location_sheet_version': {
        await get('location', parentId);
        const rows = await db
          .select()
          .from(locationSheetVariants)
          .where(
            and(
              and(
                eq(locationSheetVariants.parentId, parentId),
                eq(locationSheetVariants.parentType, 'library_location')
              ),
              eq(locationSheetVariants.id, id)
            )
          )
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
    }
  }
  return {
    get,
    list: async (
      kind: LibraryReadKind,
      input: ScopedPageInput,
      parentId = ''
    ) => {
      const scope = [teamId, kind, parentId];
      const cursor = scopedPageCursor(input, scope);
      switch (kind) {
        case 'talent': {
          const rows = await db
            .select({
              id: talent.id,
              name: talent.name,
              imageUrl: talent.imageUrl,
              isFavorite: talent.isFavorite,
              isPublic: talent.isPublic,
            })
            .from(talent)
            .where(
              and(
                or(eq(talent.teamId, teamId), eq(talent.isPublic, true)),
                cursor ? gt(talent.id, cursor) : undefined
              )
            )
            .orderBy(asc(talent.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'location': {
          const rows = await db
            .select({
              id: locationLibrary.id,
              name: locationLibrary.name,
              referenceImageUrl: locationLibrary.referenceImageUrl,
              isPublic: locationLibrary.isPublic,
            })
            .from(locationLibrary)
            .where(
              and(
                or(
                  eq(locationLibrary.teamId, teamId),
                  eq(locationLibrary.isPublic, true)
                ),
                cursor ? gt(locationLibrary.id, cursor) : undefined
              )
            )
            .orderBy(asc(locationLibrary.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'talent_sheet': {
          await get('talent', parentId);
          const rows = await db
            .select({
              id: talentSheets.id,
              name: talentSheets.name,
              imageUrl: talentSheets.imageUrl,
              isDefault: talentSheets.isDefault,
              divergedAt: talentSheets.divergedAt,
            })
            .from(talentSheets)
            .where(
              and(
                eq(talentSheets.talentId, parentId),
                cursor ? gt(talentSheets.id, cursor) : undefined
              )
            )
            .orderBy(asc(talentSheets.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'talent_media': {
          await get('talent', parentId);
          const rows = await db
            .select({
              id: talentMedia.id,
              type: talentMedia.type,
              url: talentMedia.url,
            })
            .from(talentMedia)
            .where(
              and(
                eq(talentMedia.talentId, parentId),
                cursor ? gt(talentMedia.id, cursor) : undefined
              )
            )
            .orderBy(asc(talentMedia.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'talent_sheet_version': {
          const sheet = await db
            .select()
            .from(talentSheets)
            .where(eq(talentSheets.id, parentId))
            .limit(1);
          if (!sheet[0]) throw new NotFoundError('Talent sheet not found.');
          await get('talent', sheet[0].talentId);
          const rows = await db
            .select({
              id: talentSheetVariants.id,
              model: talentSheetVariants.model,
              url: talentSheetVariants.url,
              status: talentSheetVariants.status,
              divergedAt: talentSheetVariants.divergedAt,
              discardedAt: talentSheetVariants.discardedAt,
            })
            .from(talentSheetVariants)
            .where(
              and(
                eq(talentSheetVariants.talentSheetId, parentId),
                cursor ? gt(talentSheetVariants.id, cursor) : undefined
              )
            )
            .orderBy(asc(talentSheetVariants.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'location_sheet': {
          await get('location', parentId);
          const rows = await db
            .select({
              id: locationSheets.id,
              name: locationSheets.name,
              imageUrl: locationSheets.imageUrl,
              isDefault: locationSheets.isDefault,
            })
            .from(locationSheets)
            .where(
              and(
                eq(locationSheets.locationId, parentId),
                cursor ? gt(locationSheets.id, cursor) : undefined
              )
            )
            .orderBy(asc(locationSheets.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'location_sheet_version': {
          await get('location', parentId);
          const rows = await db
            .select({
              id: locationSheetVariants.id,
              model: locationSheetVariants.model,
              url: locationSheetVariants.url,
              status: locationSheetVariants.status,
              divergedAt: locationSheetVariants.divergedAt,
              discardedAt: locationSheetVariants.discardedAt,
            })
            .from(locationSheetVariants)
            .where(
              and(
                and(
                  eq(locationSheetVariants.parentId, parentId),
                  eq(locationSheetVariants.parentType, 'library_location')
                ),
                cursor ? gt(locationSheetVariants.id, cursor) : undefined
              )
            )
            .orderBy(asc(locationSheetVariants.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
      }
    },
  };
}
