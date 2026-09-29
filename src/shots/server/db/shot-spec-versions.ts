/**
 * Scoped shot spec versions (#1915): append a spec and point the shot at it.
 * See `shot_spec_versions` for what a spec holds and what it leaves out.
 */

import { eq } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import {
  shotSpecVersions,
  shots,
  type ShotSpecSource,
  type ShotSpecVersion,
} from '@/platform/server/db/schema';
import { generateId } from '@/platform/id';
import type { StoredShotSpec } from '@/shots/shot-list.schema';

/** JSON with sorted keys, so a JSONB round-trip that reorders them still matches. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : v
  );

export function createShotSpecVersionsMethods(db: Database) {
  return {
    /**
     * Append a spec and select it, in one batch. A replayed step that sends
     * the spec the shot already has selected gets that row back instead of
     * a duplicate.
     */
    write: async (input: {
      shotId: string;
      spec: StoredShotSpec;
      source: ShotSpecSource;
      createdBy: string | null;
    }): Promise<ShotSpecVersion> => {
      const [selected] = await db
        .select({ version: shotSpecVersions })
        .from(shots)
        .innerJoin(
          shotSpecVersions,
          eq(shotSpecVersions.id, shots.selectedSpecVersionId)
        )
        .where(eq(shots.id, input.shotId))
        .limit(1);
      if (
        selected &&
        selected.version.source === input.source &&
        canonical(selected.version.spec) === canonical(input.spec)
      ) {
        return selected.version;
      }

      const id = generateId();
      const [[version]] = await db.batch([
        db
          .insert(shotSpecVersions)
          .values({
            id,
            shotId: input.shotId,
            spec: input.spec,
            source: input.source,
            createdBy: input.createdBy,
          })
          .returning(),
        db
          .update(shots)
          .set({ selectedSpecVersionId: id, updatedAt: new Date() })
          .where(eq(shots.id, input.shotId)),
      ]);
      if (!version)
        throw new Error(
          `Failed to insert shot spec version for shot ${input.shotId}`
        );
      return version;
    },
  };
}
