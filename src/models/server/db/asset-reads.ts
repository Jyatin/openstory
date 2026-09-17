import { and, desc, eq, lt } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import { generatedAssets } from '@/platform/server/db/schema';
import { NotFoundError } from '@/platform/errors';
import {
  scopedPageCursor,
  scopedPage,
  type ScopedPageInput,
} from '@/platform/server/db/scoped-read-page';

export function createAssetReads(db: Database, teamId: string) {
  return {
    list: async (
      input: ScopedPageInput & {
        source?: 'studio' | 'catalog';
        activity?: 'image' | 'video' | 'audio';
        favoritesOnly: boolean;
        endpointId?: string;
      }
    ) => {
      const scope = [
        teamId,
        'generated-assets',
        input.source ?? '',
        input.activity ?? '',
        String(input.favoritesOnly),
        input.endpointId ?? '',
      ];
      const cursor = scopedPageCursor(input, scope);
      const rows = await db
        .select({
          id: generatedAssets.id,
          source: generatedAssets.source,
          activity: generatedAssets.activity,
          modelName: generatedAssets.modelName,
          status: generatedAssets.status,
          isFavorite: generatedAssets.isFavorite,
          createdAt: generatedAssets.createdAt,
          updatedAt: generatedAssets.updatedAt,
        })
        .from(generatedAssets)
        .where(
          and(
            eq(generatedAssets.teamId, teamId),
            input.source ? eq(generatedAssets.source, input.source) : undefined,
            input.activity
              ? eq(generatedAssets.activity, input.activity)
              : undefined,
            input.favoritesOnly
              ? eq(generatedAssets.isFavorite, true)
              : undefined,
            input.endpointId
              ? eq(generatedAssets.endpointId, input.endpointId)
              : undefined,
            cursor ? lt(generatedAssets.id, cursor) : undefined
          )
        )
        .orderBy(desc(generatedAssets.id))
        .limit(input.limit + 1);
      return scopedPage(rows, input, scope);
    },
    get: async (id: string) => {
      const rows = await db
        .select()
        .from(generatedAssets)
        .where(
          and(eq(generatedAssets.id, id), eq(generatedAssets.teamId, teamId))
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundError('Generated asset not found.');
      return rows[0];
    },
  };
}
