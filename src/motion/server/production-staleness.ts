import type { ScopedDb } from '@/platform/server/db/scoped';
import type { Shot } from '@/platform/server/db/schema';
import { isSelectedVersionStale } from '@/shots/scene-segments';
import { loadInspectionShot } from '@/shots/server/production-context';
import { rendersReferenceOnly } from '@/shots/use-start-frame';
import { audioSourceKeyForDialogueLines } from '@/motion/dialogue-tts';

/** Explicit (potentially expensive) detail inspection, separate from cheap status polls. */
export async function readSegmentStaleness(
  scopedDb: ScopedDb,
  sequenceId: string,
  segmentId: string
) {
  const sequence = await scopedDb.productionInspection.getSequence(sequenceId);
  const segment = await scopedDb.productionInspection.getSegment(
    sequenceId,
    segmentId
  );
  if (!segment.selectedVideoVersionId) return { status: 'untracked' as const };
  const selected = await scopedDb.productionHistory.get({
    sequenceId,
    kind: 'video',
    entityId: segmentId,
    versionId: segment.selectedVideoVersionId,
  });
  if (selected.kind !== 'video') throw new Error('Expected video history');
  if (selected.row.discardedAt || !selected.row.manifest.length)
    return { status: 'untracked' as const };
  const members: Shot[] = [];
  let cursor: string | undefined;
  do {
    const page = await scopedDb.productionInspection.listSegmentShots({
      sequenceId,
      segmentId,
      limit: 100,
      cursor,
    });
    members.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  const characters = await scopedDb.characters.list(sequenceId);
  const motion = new Map<string, string | null>();
  const frames = new Map<string, string | null>();
  const audio = new Map<string, string | null>();
  for (const shot of members) {
    const ctx = await loadInspectionShot(scopedDb, sequenceId, shot);
    motion.set(shot.id, shot.selectedMotionPromptVersionId);
    frames.set(
      shot.id,
      rendersReferenceOnly(shot, sequence)
        ? null
        : (ctx.frame?.selectedImageVersionId ?? null)
    );
    audio.set(
      shot.id,
      ctx.scene
        ? audioSourceKeyForDialogueLines(
            ctx.scene.originalScript.dialogue,
            characters
          )
        : null
    );
  }
  return {
    status: isSelectedVersionStale(selected.row, motion, frames, audio)
      ? ('stale' as const)
      : ('fresh' as const),
  };
}
