/** Bounded, team-authorised scene/shot reads. No repair or generation side effects. */
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@/platform/server/db/client';
import {
  scenes,
  shots,
  sequences,
  sceneScriptVersions,
} from '@/platform/server/db/schema';
import { NotFoundError, ValidationError } from '@/platform/errors';
import { dbSceneId } from '@/shots/scene-id';
import { assembleShotViews, selectShotViewRows } from './shot-view-query';

const pageSchema = z.object({
  sequenceId: z.string(),
  sceneId: z.string().nullable(),
  kind: z.enum(['scenes', 'shots']),
  order: z.number(),
  shotNumber: z.number(),
  id: z.string(),
});
type Cursor = z.infer<typeof pageSchema>;
export type InspectionOptions = {
  includePrompts: boolean;
  includeAssets: boolean;
};
type PageOptions = InspectionOptions & {
  sequenceId: string;
  sceneId?: string;
  limit: number;
  cursor?: string;
};
const encode = (value: Cursor) => btoa(JSON.stringify(value));
function decode(input: PageOptions, kind: Cursor['kind']) {
  if (!input.cursor) return null;
  try {
    const value = pageSchema.parse(JSON.parse(atob(input.cursor)));
    if (
      value.kind !== kind ||
      value.sequenceId !== input.sequenceId ||
      value.sceneId !== (input.sceneId ?? null)
    )
      throw new Error('scope');
    return value;
  } catch {
    throw new ValidationError(
      'Invalid cursor for this sequence or scene filter. Restart listing.'
    );
  }
}

export function createProductionReadMethods(db: Database, teamId: string) {
  async function requireSequence(sequenceId: string) {
    const [row] = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.id, sequenceId), eq(sequences.teamId, teamId)))
      .limit(1);
    if (!row) throw new NotFoundError('Sequence not found.');
  }
  async function requireScene(sequenceId: string, sceneId: string) {
    const [row] = await db
      .select({ scene: scenes })
      .from(scenes)
      .innerJoin(sequences, eq(scenes.sequenceId, sequences.id))
      .where(
        and(
          eq(sequences.teamId, teamId),
          eq(scenes.sequenceId, sequenceId),
          eq(scenes.id, dbSceneId(sceneId)),
          isNull(scenes.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Scene not found in this sequence.');
    return row.scene;
  }
  const activeShots = (sequenceId: string) =>
    and(
      eq(sequences.teamId, teamId),
      eq(shots.sequenceId, sequenceId),
      isNull(shots.deletedAt),
      // Keep legacy scene-less shots visible, but never a shot under a deleted/wrong-sequence scene.
      or(
        isNull(shots.sceneId),
        and(eq(scenes.sequenceId, sequenceId), isNull(scenes.deletedAt))
      )
    );
  const sceneOrder = sql<number>`coalesce(${scenes.orderIndex}, 2147483647)`;
  const shotNumber = sql<number>`coalesce(${shots.shotNumber}, -1)`;
  async function loadShots(ids: string[], options: InspectionOptions) {
    if (!ids.length) return [];
    // Each batch stays below D1's 100-bound-parameter limit.
    const batches = [];
    for (let i = 0; i < ids.length; i += 80) {
      const rows = await selectShotViewRows(db, options)
        .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
        .where(
          and(
            eq(sequences.teamId, teamId),
            isNull(shots.deletedAt),
            or(
              isNull(shots.sceneId),
              and(
                eq(scenes.sequenceId, shots.sequenceId),
                isNull(scenes.deletedAt)
              )
            ),
            inArray(shots.id, ids.slice(i, i + 80))
          )
        );
      const views = await assembleShotViews(db, rows, undefined, options);
      batches.push(
        ...rows.map((row, index) => ({
          view:
            views[index] ??
            (() => {
              throw new Error('Shot assembly lost a row');
            })(),
          anchorFrameId: row.frames?.id ?? null,
          selectedImageId: row.selectedImageId,
          selectedVideoId: row.selectedVideoId,
          selectedImageUsable: row.selectedImageUsable,
          selectedVideoUsable: row.selectedVideoUsable,
        }))
      );
    }
    const position = new Map(ids.map((id, i) => [id, i]));
    return batches.sort(
      (a, b) => (position.get(a.view.id) ?? 0) - (position.get(b.view.id) ?? 0)
    );
  }
  async function listShots(input: PageOptions) {
    await requireSequence(input.sequenceId);
    if (input.sceneId) await requireScene(input.sequenceId, input.sceneId);
    const cursor = decode(input, 'shots');
    const rows = await db
      .select({ id: shots.id, order: sceneOrder, shotNumber })
      .from(shots)
      .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
      .leftJoin(scenes, eq(scenes.id, shots.sceneId))
      .where(
        and(
          activeShots(input.sequenceId),
          input.sceneId
            ? eq(shots.sceneId, dbSceneId(input.sceneId))
            : undefined,
          cursor
            ? or(
                gt(sceneOrder, cursor.order),
                and(
                  eq(sceneOrder, cursor.order),
                  gt(shotNumber, cursor.shotNumber)
                ),
                and(
                  eq(sceneOrder, cursor.order),
                  eq(shotNumber, cursor.shotNumber),
                  gt(shots.id, cursor.id)
                )
              )
            : undefined
        )
      )
      .orderBy(asc(sceneOrder), asc(shotNumber), asc(shots.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      shots: await loadShots(
        page.map((r) => r.id),
        input
      ),
      nextCursor:
        rows.length > input.limit && last
          ? encode({
              ...last,
              kind: 'shots',
              sequenceId: input.sequenceId,
              sceneId: input.sceneId ?? null,
            })
          : null,
    };
  }
  async function getShot(sequenceId: string, shotId: string) {
    await requireSequence(sequenceId);
    const [row] = await db
      .select({ id: shots.id })
      .from(shots)
      .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
      .leftJoin(scenes, eq(scenes.id, shots.sceneId))
      .where(and(activeShots(sequenceId), eq(shots.id, shotId)))
      .limit(1);
    if (!row) throw new NotFoundError('Shot not found in this sequence.');
    const [detail] = await loadShots([row.id], {
      includeAssets: true,
      includePrompts: true,
    });
    if (!detail) throw new NotFoundError('Shot not found in this sequence.');
    return detail;
  }
  async function listScenes(input: PageOptions) {
    await requireSequence(input.sequenceId);
    const cursor = decode(input, 'scenes');
    const rows = await db
      .select({ scene: scenes })
      .from(scenes)
      .innerJoin(sequences, eq(scenes.sequenceId, sequences.id))
      .where(
        and(
          eq(sequences.teamId, teamId),
          eq(scenes.sequenceId, input.sequenceId),
          isNull(scenes.deletedAt),
          cursor
            ? or(
                gt(scenes.orderIndex, cursor.order),
                and(
                  eq(scenes.orderIndex, cursor.order),
                  gt(scenes.id, dbSceneId(cursor.id))
                )
              )
            : undefined
        )
      )
      .orderBy(asc(scenes.orderIndex), asc(scenes.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit).map((r) => r.scene);
    // One bounded batch for nested shots. Extra children are explicitly discoverable via list_shots.
    const nested: { id: string; sceneId: string | null; position: number }[] =
      [];
    for (let i = 0; i < page.length; i += 80) {
      const ids = page.slice(i, i + 80).map((s) => s.id);
      const ranked = db
        .select({
          id: shots.id,
          sceneId: shots.sceneId,
          position:
            sql<number>`row_number() over (partition by ${shots.sceneId} order by ${shots.shotNumber}, ${shots.id})`.as(
              'position'
            ),
        })
        .from(shots)
        .where(
          and(
            eq(shots.sequenceId, input.sequenceId),
            inArray(shots.sceneId, ids),
            isNull(shots.deletedAt)
          )
        )
        .as('ranked');
      nested.push(
        ...(await db
          .select()
          .from(ranked)
          .where(sql`${ranked.position} <= 6`)
          .orderBy(ranked.sceneId, ranked.position))
      );
    }
    const detail = await loadShots(
      nested.filter((r) => r.position <= 5).map((r) => r.id),
      input
    );
    const last = page.at(-1);
    return {
      scenes: page.map((scene) => ({
        scene,
        shots: detail.filter((r) => r.view.sceneId === scene.id),
        shotsTruncated: nested.some(
          (r) => r.sceneId === scene.id && r.position > 5
        ),
      })),
      nextCursor:
        rows.length > input.limit && last
          ? encode({
              kind: 'scenes',
              sequenceId: input.sequenceId,
              sceneId: null,
              order: last.orderIndex,
              shotNumber: 0,
              id: last.id,
            })
          : null,
    };
  }
  async function getScene(sequenceId: string, sceneId: string) {
    const scene = await requireScene(sequenceId, sceneId);
    const [script] = scene.selectedScriptVersionId
      ? await db
          .select()
          .from(sceneScriptVersions)
          .where(
            and(
              eq(sceneScriptVersions.id, scene.selectedScriptVersionId),
              eq(sceneScriptVersions.sceneId, scene.id)
            )
          )
          .limit(1)
      : [];
    const page = await listShots({
      sequenceId,
      sceneId,
      limit: 100,
      includeAssets: true,
      includePrompts: true,
    });
    return {
      scene,
      script: script ?? null,
      shots: page.shots,
      shotsTruncated: page.nextCursor !== null,
    };
  }
  return {
    scenes: { listPage: listScenes, getDetail: getScene },
    shots: { listPage: listShots, getDetail: getShot },
  };
}
export type ShotInspectionRead = Awaited<
  ReturnType<
    ReturnType<typeof createProductionReadMethods>['shots']['getDetail']
  >
>;
export type SceneInspectionRead = Awaited<
  ReturnType<
    ReturnType<typeof createProductionReadMethods>['scenes']['getDetail']
  >
>;
