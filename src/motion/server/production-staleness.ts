import type { ScopedDb } from '@/platform/server/db/scoped';
import { loadSequenceSegments } from '@/shots/server/sequence-segments';

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
  // The editor's own assembly over every shot in the sequence, so this verdict
  // and the Scenes editor badge are one derivation.
  const { assembled } = await loadSequenceSegments(
    scopedDb,
    sequence,
    await scopedDb.shots.listBySequence(sequenceId)
  );
  const current = assembled.find((s) => s.id === segmentId);
  if (!current)
    throw new Error(`Render segment ${segmentId} was not assembled`);
  return { status: current.stale ? ('stale' as const) : ('fresh' as const) };
}
