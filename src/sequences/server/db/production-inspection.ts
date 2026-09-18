import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import {
  frames,
  renderSegments,
  scenes,
  sceneScriptVersions,
  sequenceEvents,
  sequenceExports,
  shots,
} from '@/platform/server/db/schema';
import {
  readPage,
  readPageCursor,
  type ReadPageInput,
} from '@/platform/server/db/read-page';
import { NotFoundError } from '@/platform/errors';
import { composeSequenceScript } from '@/shots/server/scene-script';
import { createProductionAccess } from './production-access';

export function createSequenceInspectionReads(db: Database, teamId: string) {
  const access = createProductionAccess(db, teamId);
  return {
    getSequence: access.sequence,
    getScene: access.scene,
    getShot: access.shot,
    getFrame: access.frame,
    getSegment: access.segment,
    getCharacter: access.character,
    getLocation: access.location,
    getElement: access.element,
    async listFrames(input: ReadPageInput & { shotId: string }) {
      await access.shot(input.sequenceId, input.shotId);
      const after = readPageCursor(input, 'frames', input.shotId);
      return readPage(
        await db
          .select()
          .from(frames)
          .where(
            and(
              eq(frames.sequenceId, input.sequenceId),
              eq(frames.shotId, input.shotId),
              after ? gt(frames.id, after) : undefined
            )
          )
          .orderBy(asc(frames.id))
          .limit(input.limit + 1),
        input,
        'frames',
        input.shotId
      );
    },
    async listSegments(input: ReadPageInput & { sceneId?: string }) {
      await access.sequence(input.sequenceId);
      const scene = input.sceneId
        ? await access.scene(input.sequenceId, input.sceneId)
        : null;
      const scope = ['segments', input.sceneId ?? ''];
      const after = readPageCursor(input, ...scope);
      const rows = await db
        .select({ segment: renderSegments })
        .from(renderSegments)
        .innerJoin(scenes, eq(renderSegments.sceneId, scenes.id))
        .where(
          and(
            eq(renderSegments.sequenceId, input.sequenceId),
            eq(scenes.sequenceId, input.sequenceId),
            isNull(scenes.deletedAt),
            scene ? eq(renderSegments.sceneId, scene.id) : undefined,
            after ? gt(renderSegments.id, after) : undefined
          )
        )
        .orderBy(asc(renderSegments.id))
        .limit(input.limit + 1);
      return readPage(
        rows.map((r) => r.segment),
        input,
        ...scope
      );
    },
    async listSegmentShots(input: ReadPageInput & { segmentId: string }) {
      const segment = await access.segment(input.sequenceId, input.segmentId);
      const scope = ['segment-shots', input.segmentId];
      const after = readPageCursor(input, ...scope);
      return readPage(
        await db
          .select()
          .from(shots)
          .where(
            and(
              eq(shots.sequenceId, input.sequenceId),
              eq(shots.sceneId, segment.sceneId),
              eq(shots.renderSegmentId, segment.id),
              isNull(shots.deletedAt),
              after ? gt(shots.id, after) : undefined
            )
          )
          .orderBy(asc(shots.id))
          .limit(input.limit + 1),
        input,
        ...scope
      );
    },
    async listEvents(
      input: ReadPageInput & {
        targetType?: typeof sequenceEvents.$inferSelect.targetType;
        targetId?: string;
      }
    ) {
      await access.sequence(input.sequenceId);
      const scope = ['events', input.targetType ?? '', input.targetId ?? ''];
      const after = readPageCursor(input, ...scope);
      return readPage(
        await db
          .select({
            id: sequenceEvents.id,
            sequenceId: sequenceEvents.sequenceId,
            actorId: sequenceEvents.actorId,
            kind: sequenceEvents.kind,
            targetType: sequenceEvents.targetType,
            targetId: sequenceEvents.targetId,
            summary: sequenceEvents.summary,
            createdAt: sequenceEvents.createdAt,
          })
          .from(sequenceEvents)
          .where(
            and(
              eq(sequenceEvents.sequenceId, input.sequenceId),
              input.targetType
                ? eq(sequenceEvents.targetType, input.targetType)
                : undefined,
              input.targetId
                ? eq(sequenceEvents.targetId, input.targetId)
                : undefined,
              after ? gt(sequenceEvents.id, after) : undefined
            )
          )
          .orderBy(asc(sequenceEvents.id))
          .limit(input.limit + 1),
        input,
        ...scope
      );
    },
    async getEvent(sequenceId: string, eventId: string) {
      await access.sequence(sequenceId);
      const [row] = await db
        .select()
        .from(sequenceEvents)
        .where(
          and(
            eq(sequenceEvents.sequenceId, sequenceId),
            eq(sequenceEvents.id, eventId)
          )
        )
        .limit(1);
      if (!row) throw new NotFoundError('Event not found in this sequence.');
      return row;
    },
    async listExports(input: ReadPageInput) {
      await access.sequence(input.sequenceId);
      const after = readPageCursor(input, 'exports');
      return readPage(
        await db
          .select()
          .from(sequenceExports)
          .where(
            and(
              eq(sequenceExports.sequenceId, input.sequenceId),
              after ? gt(sequenceExports.id, after) : undefined
            )
          )
          .orderBy(asc(sequenceExports.id))
          .limit(input.limit + 1),
        input,
        'exports'
      );
    },
    async getExport(sequenceId: string, exportId: string) {
      await access.sequence(sequenceId);
      const [row] = await db
        .select()
        .from(sequenceExports)
        .where(
          and(
            eq(sequenceExports.sequenceId, sequenceId),
            eq(sequenceExports.id, exportId)
          )
        )
        .limit(1);
      if (!row) throw new NotFoundError('Export not found in this sequence.');
      return row;
    },
    async getComposedScript(sequenceId: string) {
      const sequence = await access.sequence(sequenceId);
      const rows = await db
        .select({
          orderIndex: scenes.orderIndex,
          content: sceneScriptVersions.content,
        })
        .from(scenes)
        .innerJoin(
          sceneScriptVersions,
          and(
            eq(sceneScriptVersions.id, scenes.selectedScriptVersionId),
            eq(sceneScriptVersions.sceneId, scenes.id)
          )
        )
        .where(and(eq(scenes.sequenceId, sequenceId), isNull(scenes.deletedAt)))
        .orderBy(asc(scenes.orderIndex), asc(scenes.id));
      return composeSequenceScript(rows) || sequence.script || '';
    },
    async listShotRows(
      input: ReadPageInput & { sceneId?: string },
      cursorScope = ''
    ) {
      await access.sequence(input.sequenceId);
      const scene = input.sceneId
        ? await access.scene(input.sequenceId, input.sceneId)
        : null;
      const scope = ['shot-inspection', input.sceneId ?? '', cursorScope];
      const after = readPageCursor(input, ...scope);
      const rows = await db
        .select({ shot: shots })
        .from(shots)
        .leftJoin(scenes, eq(shots.sceneId, scenes.id))
        .where(
          and(
            eq(shots.sequenceId, input.sequenceId),
            isNull(shots.deletedAt),
            or(
              isNull(shots.sceneId),
              and(
                eq(scenes.sequenceId, input.sequenceId),
                isNull(scenes.deletedAt)
              )
            ),
            scene ? eq(shots.sceneId, scene.id) : undefined,
            after ? gt(shots.id, after) : undefined
          )
        )
        .orderBy(asc(shots.id))
        .limit(input.limit + 1);
      return readPage(
        rows.map((r) => r.shot),
        input,
        ...scope
      );
    },
  };
}
