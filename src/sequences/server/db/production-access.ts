import { and, eq, isNull, or } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import {
  sequences,
  scenes,
  shots,
  frames,
  renderSegments,
  characters,
  sequenceLocations,
  sequenceElements,
} from '@/platform/server/db/schema';
import { NotFoundError } from '@/platform/errors';
import { dbSceneId } from '@/shots/scene-id';

/** Authorise the complete parent chain before reading any production history. */
export function createProductionAccess(db: Database, teamId: string) {
  async function sequence(id: string) {
    const [row] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.teamId, teamId)))
      .limit(1);
    if (!row) throw new NotFoundError('Sequence not found.');
    return row;
  }
  async function scene(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select()
      .from(scenes)
      .where(
        and(
          eq(scenes.id, dbSceneId(id)),
          eq(scenes.sequenceId, sequenceId),
          isNull(scenes.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Scene not found in this sequence.');
    return row;
  }
  async function shot(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select({ shot: shots })
      .from(shots)
      .leftJoin(scenes, eq(shots.sceneId, scenes.id))
      .where(
        and(
          eq(shots.id, id),
          eq(shots.sequenceId, sequenceId),
          isNull(shots.deletedAt),
          or(
            isNull(shots.sceneId),
            and(eq(scenes.sequenceId, sequenceId), isNull(scenes.deletedAt))
          )
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Shot not found in this sequence.');
    return row.shot;
  }
  async function frame(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select()
      .from(frames)
      .where(and(eq(frames.id, id), eq(frames.sequenceId, sequenceId)))
      .limit(1);
    if (!row) throw new NotFoundError('Frame not found in this sequence.');
    await shot(sequenceId, row.shotId);
    return row;
  }
  async function segment(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select()
      .from(renderSegments)
      .where(
        and(
          eq(renderSegments.id, id),
          eq(renderSegments.sequenceId, sequenceId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Render segment not found in this sequence.');
    await scene(sequenceId, row.sceneId);
    return row;
  }
  async function character(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.id, id),
          eq(characters.sequenceId, sequenceId),
          isNull(characters.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Character not found in this sequence.');
    return row;
  }
  async function location(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select()
      .from(sequenceLocations)
      .where(
        and(
          eq(sequenceLocations.id, id),
          eq(sequenceLocations.sequenceId, sequenceId),
          isNull(sequenceLocations.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Location not found in this sequence.');
    return row;
  }
  async function element(sequenceId: string, id: string) {
    await sequence(sequenceId);
    const [row] = await db
      .select()
      .from(sequenceElements)
      .where(
        and(
          eq(sequenceElements.id, id),
          eq(sequenceElements.sequenceId, sequenceId),
          isNull(sequenceElements.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Element not found in this sequence.');
    return row;
  }
  return {
    sequence,
    scene,
    shot,
    frame,
    segment,
    character,
    location,
    element,
  };
}
