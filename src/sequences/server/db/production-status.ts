/** Narrow status reads: no scripts, prompts, manifests, or version histories. */
import { and, eq, isNull, or, sql, desc, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Database } from '@/platform/server/db/client';
import {
  frames,
  shots,
  scenes,
  sequences,
  frameVariants,
  renderSegments,
  videoVariants,
  sequenceExports,
} from '@/platform/server/db/schema';
import { primaryVideoIdForShot } from '@/motion/server/db/video-variants';

export function createProductionStatusMethods(db: Database, teamId: string) {
  async function readShots(sequenceIds: string[], includeFailures: boolean) {
    const primary = alias(videoVariants, 'primary_video_status');
    return await db
      .select({
        sequenceId: shots.sequenceId,
        shotId: shots.id,
        useStartFrame: shots.useStartFrame,
        renderSegmentId: shots.renderSegmentId,
        frameId: frames.id,
        imageStatus: frames.imageStatus,
        imageWorkflowRunId: frames.imageWorkflowRunId,
        imageError: includeFailures ? frames.imageError : sql<null>`NULL`,
        selectedImageUrl: frameVariants.url,
        hasSelectedVideo:
          sql<boolean>`${videoVariants.url} is not null`.mapWith(Boolean),
        primaryVideoId: primary.id,
        primaryVideoStatus: primary.status,
        videoWorkflowRunId: primary.workflowRunId,
        videoError: includeFailures ? primary.error : sql<null>`NULL`,
      })
      .from(shots)
      .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
      .leftJoin(scenes, eq(shots.sceneId, scenes.id))
      .leftJoin(
        frames,
        and(
          eq(frames.shotId, shots.id),
          eq(frames.orderIndex, 0),
          eq(frames.sequenceId, shots.sequenceId)
        )
      )
      .leftJoin(
        frameVariants,
        and(
          eq(frameVariants.id, frames.selectedImageVersionId),
          eq(frameVariants.frameId, frames.id),
          isNull(frameVariants.discardedAt)
        )
      )
      .leftJoin(
        renderSegments,
        and(
          eq(renderSegments.id, shots.renderSegmentId),
          eq(renderSegments.sequenceId, shots.sequenceId)
        )
      )
      .leftJoin(
        videoVariants,
        and(
          eq(videoVariants.id, renderSegments.selectedVideoVersionId),
          eq(videoVariants.renderSegmentId, renderSegments.id),
          isNull(videoVariants.discardedAt)
        )
      )
      .leftJoin(
        primary,
        and(
          eq(primary.id, primaryVideoIdForShot()),
          eq(primary.sequenceId, shots.sequenceId)
        )
      )
      .where(
        and(
          eq(sequences.teamId, teamId),
          inArray(shots.sequenceId, sequenceIds),
          isNull(shots.deletedAt),
          or(
            isNull(shots.sceneId),
            and(
              eq(scenes.sequenceId, shots.sequenceId),
              isNull(scenes.deletedAt)
            )
          )
        )
      );
  }
  return {
    listProductionReadiness: async (sequenceIds: string[]) => {
      const rows: Awaited<ReturnType<typeof readShots>> = [];
      for (let i = 0; i < sequenceIds.length; i += 80)
        rows.push(...(await readShots(sequenceIds.slice(i, i + 80), false)));
      return rows;
    },
    getProductionStatus: async (
      sequenceId: string,
      includeFailures: boolean
    ) => {
      const rows = await readShots([sequenceId], includeFailures);
      // Include all frame roles for failures; image-ready tallies still count anchor-frame shots.
      const failedFrames = includeFailures
        ? await db
            .select({
              id: frames.id,
              shotId: shots.id,
              error: frames.imageError,
            })
            .from(frames)
            .innerJoin(shots, eq(frames.shotId, shots.id))
            .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
            .leftJoin(scenes, eq(shots.sceneId, scenes.id))
            .where(
              and(
                eq(sequences.teamId, teamId),
                eq(shots.sequenceId, sequenceId),
                eq(frames.sequenceId, sequenceId),
                eq(frames.imageStatus, 'failed'),
                isNull(shots.deletedAt),
                or(
                  isNull(shots.sceneId),
                  and(
                    eq(scenes.sequenceId, sequenceId),
                    isNull(scenes.deletedAt)
                  )
                )
              )
            )
            .orderBy(frames.id)
            .limit(101)
        : [];
      const readExports = async (status: 'processing' | 'failed') =>
        await db
          .select({
            id: sequenceExports.id,
            status: sequenceExports.status,
            workflowRunId: sequenceExports.workflowRunId,
            error: includeFailures ? sequenceExports.error : sql<null>`NULL`,
          })
          .from(sequenceExports)
          .innerJoin(sequences, eq(sequenceExports.sequenceId, sequences.id))
          .where(
            and(
              eq(sequences.teamId, teamId),
              eq(sequenceExports.sequenceId, sequenceId),
              eq(sequenceExports.status, status)
            )
          )
          .orderBy(desc(sequenceExports.createdAt), desc(sequenceExports.id))
          .limit(101);
      const [activeExports, failedExports] = await Promise.all([
        readExports('processing'),
        includeFailures ? readExports('failed') : Promise.resolve([]),
      ]);
      const exports = [...activeExports, ...failedExports];
      return { rows, failedFrames, exports };
    },
  };
}
export type ProductionStatusRead = Awaited<
  ReturnType<
    ReturnType<typeof createProductionStatusMethods>['getProductionStatus']
  >
>;
