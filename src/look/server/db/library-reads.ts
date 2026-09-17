import { and, asc, eq, gt, or, isNull } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import { styles, audio, vfx } from '@/platform/server/db/schema';
import { NotFoundError } from '@/platform/errors';
import {
  scopedPageCursor,
  scopedPage,
  type ScopedPageInput,
} from '@/platform/server/db/scoped-read-page';

export type LibraryReadKind = 'style' | 'audio' | 'vfx';

export function createLookLibraryReads(db: Database, teamId: string) {
  async function getStyle(id: string) {
    const rows = await db
      .select()
      .from(styles)
      .where(
        and(
          and(
            or(eq(styles.teamId, teamId), eq(styles.isPublic, true)),
            isNull(styles.sequenceId)
          ),
          eq(styles.id, id)
        )
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundError('Library resource not found.');
    return rows[0];
  }

  async function get(kind: LibraryReadKind, id: string, _parentId = '') {
    switch (kind) {
      case 'style':
        return getStyle(id);
      case 'audio': {
        const rows = await db
          .select()
          .from(audio)
          .where(and(eq(audio.teamId, teamId), eq(audio.id, id)))
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
      case 'vfx': {
        const rows = await db
          .select()
          .from(vfx)
          .where(and(eq(vfx.teamId, teamId), eq(vfx.id, id)))
          .limit(1);
        if (!rows[0]) throw new NotFoundError('Library resource not found.');
        return rows[0];
      }
    }
  }
  return {
    get,
    getStyle,
    listGalleryStyles: async (input: ScopedPageInput) => {
      const scope = [teamId, 'gallery'];
      const cursor = scopedPageCursor(input, scope);
      const rows = await db
        .select()
        .from(styles)
        .where(
          and(
            or(eq(styles.teamId, teamId), eq(styles.isPublic, true)),
            isNull(styles.sequenceId),
            cursor ? gt(styles.id, cursor) : undefined
          )
        )
        .orderBy(asc(styles.id))
        .limit(input.limit + 1);
      return scopedPage(rows, input, scope);
    },
    list: async (
      kind: LibraryReadKind,
      input: ScopedPageInput,
      parentId = ''
    ) => {
      const scope = [teamId, kind, parentId];
      const cursor = scopedPageCursor(input, scope);
      switch (kind) {
        case 'style': {
          const rows = await db
            .select({
              id: styles.id,
              name: styles.name,
              category: styles.category,
              previewUrl: styles.previewUrl,
              isPublic: styles.isPublic,
            })
            .from(styles)
            .where(
              and(
                and(
                  or(eq(styles.teamId, teamId), eq(styles.isPublic, true)),
                  isNull(styles.sequenceId)
                ),
                cursor ? gt(styles.id, cursor) : undefined
              )
            )
            .orderBy(asc(styles.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'audio': {
          const rows = await db
            .select({
              id: audio.id,
              name: audio.name,
              fileUrl: audio.fileUrl,
              durationMs: audio.durationMs,
            })
            .from(audio)
            .where(
              and(
                eq(audio.teamId, teamId),
                cursor ? gt(audio.id, cursor) : undefined
              )
            )
            .orderBy(asc(audio.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
        case 'vfx': {
          const rows = await db
            .select({ id: vfx.id, name: vfx.name, previewUrl: vfx.previewUrl })
            .from(vfx)
            .where(
              and(
                eq(vfx.teamId, teamId),
                cursor ? gt(vfx.id, cursor) : undefined
              )
            )
            .orderBy(asc(vfx.id))
            .limit(input.limit + 1);
          return scopedPage(rows, input, scope);
        }
      }
    },
  };
}
