/** Sequence history traversal. Each collection validates its owning production entity. */
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/platform/server/db/client';
import {
  frameVariants,
  videoVariants,
  characterSheetVariants,
  locationSheetVariants,
  sequenceMusicVariants,
  framePromptVersions,
  shotPromptVersions,
  sequenceMusicPromptVersions,
  sceneScriptVersions,
} from '@/platform/server/db/schema';
import { NotFoundError, ValidationError } from '@/platform/errors';
import {
  readPage,
  readPageCursor,
  type ReadPageInput,
} from '@/platform/server/db/read-page';
import { createProductionAccess } from './production-access';
import type { VersionKind } from '../production-history';

type VersionInput = { sequenceId: string; kind: VersionKind; entityId: string };
type VersionPage = VersionInput & ReadPageInput & { includeDiscarded: boolean };
export function createProductionHistoryReads(db: Database, teamId: string) {
  const access = createProductionAccess(db, teamId);
  async function listImage(input: VersionPage) {
    const parent = await access.frame(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: frameVariants.id,
        createdAt: frameVariants.createdAt,
        model: frameVariants.model,
        status: frameVariants.status,
        url: frameVariants.url,
        error: frameVariants.error,
        discardedAt: frameVariants.discardedAt,
        kind: frameVariants.kind,
        inputHash: frameVariants.inputHash,
      })
      .from(frameVariants)
      .where(
        and(
          eq(frameVariants.frameId, parent.id),
          eq(frameVariants.sequenceId, input.sequenceId),
          !input.includeDiscarded
            ? isNull(frameVariants.discardedAt)
            : undefined,
          after ? gt(frameVariants.id, after) : undefined
        )
      )
      .orderBy(asc(frameVariants.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === parent.selectedImageVersionId,
      })),
      input,
      ...scope
    );
  }
  async function getImage(input: VersionInput & { versionId: string }) {
    const parent = await access.frame(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(frameVariants)
      .where(
        and(
          eq(frameVariants.frameId, parent.id),
          eq(frameVariants.sequenceId, input.sequenceId),
          eq(frameVariants.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'image' as const,
      row,
      selected: row.id === parent.selectedImageVersionId,
    };
  }
  async function listVideo(input: VersionPage) {
    const parent = await access.segment(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: videoVariants.id,
        createdAt: videoVariants.createdAt,
        model: videoVariants.model,
        status: videoVariants.status,
        url: videoVariants.url,
        error: videoVariants.error,
        discardedAt: videoVariants.discardedAt,
        inputHash: videoVariants.inputHash,
      })
      .from(videoVariants)
      .where(
        and(
          eq(videoVariants.renderSegmentId, parent.id),
          eq(videoVariants.sequenceId, input.sequenceId),
          !input.includeDiscarded
            ? isNull(videoVariants.discardedAt)
            : undefined,
          after ? gt(videoVariants.id, after) : undefined
        )
      )
      .orderBy(asc(videoVariants.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === parent.selectedVideoVersionId,
      })),
      input,
      ...scope
    );
  }
  async function getVideo(input: VersionInput & { versionId: string }) {
    const parent = await access.segment(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(videoVariants)
      .where(
        and(
          eq(videoVariants.renderSegmentId, parent.id),
          eq(videoVariants.sequenceId, input.sequenceId),
          eq(videoVariants.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'video' as const,
      row,
      selected: row.id === parent.selectedVideoVersionId,
    };
  }
  async function listCharacterSheet(input: VersionPage) {
    const parent = await access.character(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: characterSheetVariants.id,
        createdAt: characterSheetVariants.createdAt,
        model: characterSheetVariants.model,
        status: characterSheetVariants.status,
        url: characterSheetVariants.url,
        error: characterSheetVariants.error,
        discardedAt: characterSheetVariants.discardedAt,
        inputHash: characterSheetVariants.inputHash,
      })
      .from(characterSheetVariants)
      .where(
        and(
          eq(characterSheetVariants.characterId, parent.id),
          !input.includeDiscarded
            ? isNull(characterSheetVariants.discardedAt)
            : undefined,
          after ? gt(characterSheetVariants.id, after) : undefined
        )
      )
      .orderBy(asc(characterSheetVariants.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === (parent.selectedSheetVersionId ?? parent.id),
      })),
      input,
      ...scope
    );
  }
  async function getCharacterSheet(
    input: VersionInput & { versionId: string }
  ) {
    const parent = await access.character(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(characterSheetVariants)
      .where(
        and(
          eq(characterSheetVariants.characterId, parent.id),
          eq(characterSheetVariants.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'character_sheet' as const,
      row,
      selected: row.id === (parent.selectedSheetVersionId ?? parent.id),
    };
  }
  async function listLocationSheet(input: VersionPage) {
    const parent = await access.location(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: locationSheetVariants.id,
        createdAt: locationSheetVariants.createdAt,
        model: locationSheetVariants.model,
        status: locationSheetVariants.status,
        url: locationSheetVariants.url,
        error: locationSheetVariants.error,
        discardedAt: locationSheetVariants.discardedAt,
        inputHash: locationSheetVariants.inputHash,
      })
      .from(locationSheetVariants)
      .where(
        and(
          eq(locationSheetVariants.parentId, parent.id),
          eq(locationSheetVariants.parentType, 'sequence_location'),
          !input.includeDiscarded
            ? isNull(locationSheetVariants.discardedAt)
            : undefined,
          after ? gt(locationSheetVariants.id, after) : undefined
        )
      )
      .orderBy(asc(locationSheetVariants.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === (parent.selectedReferenceVersionId ?? parent.id),
      })),
      input,
      ...scope
    );
  }
  async function getLocationSheet(input: VersionInput & { versionId: string }) {
    const parent = await access.location(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(locationSheetVariants)
      .where(
        and(
          eq(locationSheetVariants.parentId, parent.id),
          eq(locationSheetVariants.parentType, 'sequence_location'),
          eq(locationSheetVariants.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'location_sheet' as const,
      row,
      selected: row.id === (parent.selectedReferenceVersionId ?? parent.id),
    };
  }
  async function listMusic(input: VersionPage) {
    if (input.entityId !== input.sequenceId)
      throw new ValidationError(
        'Music histories use the sequence ID as entityId.'
      );
    const parent = await access.sequence(input.sequenceId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: sequenceMusicVariants.id,
        createdAt: sequenceMusicVariants.createdAt,
        model: sequenceMusicVariants.model,
        status: sequenceMusicVariants.status,
        url: sequenceMusicVariants.url,
        error: sequenceMusicVariants.error,
        discardedAt: sequenceMusicVariants.discardedAt,
        inputHash: sequenceMusicVariants.inputHash,
      })
      .from(sequenceMusicVariants)
      .where(
        and(
          eq(sequenceMusicVariants.sequenceId, parent.id),
          !input.includeDiscarded
            ? isNull(sequenceMusicVariants.discardedAt)
            : undefined,
          after ? gt(sequenceMusicVariants.id, after) : undefined
        )
      )
      .orderBy(asc(sequenceMusicVariants.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected:
          row.url !== null &&
          row.url === parent.musicUrl &&
          row.model === parent.musicModel,
      })),
      input,
      ...scope
    );
  }
  async function getMusic(input: VersionInput & { versionId: string }) {
    if (input.entityId !== input.sequenceId)
      throw new ValidationError(
        'Music histories use the sequence ID as entityId.'
      );
    const parent = await access.sequence(input.sequenceId);
    const [row] = await db
      .select()
      .from(sequenceMusicVariants)
      .where(
        and(
          eq(sequenceMusicVariants.sequenceId, parent.id),
          eq(sequenceMusicVariants.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'music' as const,
      row,
      selected:
        row.url !== null &&
        row.url === parent.musicUrl &&
        row.model === parent.musicModel,
    };
  }
  async function listVisualPrompt(input: VersionPage) {
    const parent = await access.frame(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: framePromptVersions.id,
        createdAt: framePromptVersions.createdAt,
        analysisModel: framePromptVersions.analysisModel,
        status: framePromptVersions.status,
        source: framePromptVersions.source,
        inputHash: framePromptVersions.inputHash,
      })
      .from(framePromptVersions)
      .where(
        and(
          eq(framePromptVersions.frameId, parent.id),
          after ? gt(framePromptVersions.id, after) : undefined
        )
      )
      .orderBy(asc(framePromptVersions.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === parent.selectedImagePromptVersionId,
      })),
      input,
      ...scope
    );
  }
  async function getVisualPrompt(input: VersionInput & { versionId: string }) {
    const parent = await access.frame(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(framePromptVersions)
      .where(
        and(
          eq(framePromptVersions.frameId, parent.id),
          eq(framePromptVersions.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'visual_prompt' as const,
      row,
      selected: row.id === parent.selectedImagePromptVersionId,
    };
  }
  async function listMotionPrompt(input: VersionPage) {
    const parent = await access.shot(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: shotPromptVersions.id,
        createdAt: shotPromptVersions.createdAt,
        analysisModel: shotPromptVersions.analysisModel,
        status: shotPromptVersions.status,
        source: shotPromptVersions.source,
        inputHash: shotPromptVersions.inputHash,
      })
      .from(shotPromptVersions)
      .where(
        and(
          eq(shotPromptVersions.shotId, parent.id),
          eq(shotPromptVersions.promptType, 'motion'),
          after ? gt(shotPromptVersions.id, after) : undefined
        )
      )
      .orderBy(asc(shotPromptVersions.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === parent.selectedMotionPromptVersionId,
      })),
      input,
      ...scope
    );
  }
  async function getMotionPrompt(input: VersionInput & { versionId: string }) {
    const parent = await access.shot(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(shotPromptVersions)
      .where(
        and(
          eq(shotPromptVersions.shotId, parent.id),
          eq(shotPromptVersions.promptType, 'motion'),
          eq(shotPromptVersions.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'motion_prompt' as const,
      row,
      selected: row.id === parent.selectedMotionPromptVersionId,
    };
  }
  async function listMusicPrompt(input: VersionPage) {
    if (input.entityId !== input.sequenceId)
      throw new ValidationError(
        'Music histories use the sequence ID as entityId.'
      );
    const parent = await access.sequence(input.sequenceId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: sequenceMusicPromptVersions.id,
        createdAt: sequenceMusicPromptVersions.createdAt,
        analysisModel: sequenceMusicPromptVersions.analysisModel,
        source: sequenceMusicPromptVersions.source,
        inputHash: sequenceMusicPromptVersions.inputHash,
        selected:
          sql<boolean>`${sequenceMusicPromptVersions.prompt} is ${parent.musicPrompt} and ${sequenceMusicPromptVersions.tags} is ${parent.musicTags}`.mapWith(
            Boolean
          ),
      })
      .from(sequenceMusicPromptVersions)
      .where(
        and(
          eq(sequenceMusicPromptVersions.sequenceId, parent.id),
          after ? gt(sequenceMusicPromptVersions.id, after) : undefined
        )
      )
      .orderBy(asc(sequenceMusicPromptVersions.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.selected,
      })),
      input,
      ...scope
    );
  }
  async function getMusicPrompt(input: VersionInput & { versionId: string }) {
    if (input.entityId !== input.sequenceId)
      throw new ValidationError(
        'Music histories use the sequence ID as entityId.'
      );
    const parent = await access.sequence(input.sequenceId);
    const [row] = await db
      .select()
      .from(sequenceMusicPromptVersions)
      .where(
        and(
          eq(sequenceMusicPromptVersions.sequenceId, parent.id),
          eq(sequenceMusicPromptVersions.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'music_prompt' as const,
      row,
      selected:
        row.prompt === parent.musicPrompt && row.tags === parent.musicTags,
    };
  }
  async function listSceneScript(input: VersionPage) {
    const parent = await access.scene(input.sequenceId, input.entityId);
    const scope = [input.kind, input.entityId, String(input.includeDiscarded)];
    const after = readPageCursor(input, ...scope);
    const rows = await db
      .select({
        id: sceneScriptVersions.id,
        createdAt: sceneScriptVersions.createdAt,
        source: sceneScriptVersions.source,
      })
      .from(sceneScriptVersions)
      .where(
        and(
          eq(sceneScriptVersions.sceneId, parent.id),
          after ? gt(sceneScriptVersions.id, after) : undefined
        )
      )
      .orderBy(asc(sceneScriptVersions.id))
      .limit(input.limit + 1);
    return readPage(
      rows.map((row) => ({
        ...row,
        kind: input.kind,
        entityId: parent.id,
        selected: row.id === parent.selectedScriptVersionId,
      })),
      input,
      ...scope
    );
  }
  async function getSceneScript(input: VersionInput & { versionId: string }) {
    const parent = await access.scene(input.sequenceId, input.entityId);
    const [row] = await db
      .select()
      .from(sceneScriptVersions)
      .where(
        and(
          eq(sceneScriptVersions.sceneId, parent.id),
          eq(sceneScriptVersions.id, input.versionId)
        )
      )
      .limit(1);
    if (!row)
      throw new NotFoundError('Version not found for this production entity.');
    return {
      kind: 'scene_script' as const,
      row,
      selected: row.id === parent.selectedScriptVersionId,
    };
  }
  return {
    async list(input: VersionPage) {
      switch (input.kind) {
        case 'image':
          return listImage(input);
        case 'video':
          return listVideo(input);
        case 'character_sheet':
          return listCharacterSheet(input);
        case 'location_sheet':
          return listLocationSheet(input);
        case 'music':
          return listMusic(input);
        case 'visual_prompt':
          return listVisualPrompt(input);
        case 'motion_prompt':
          return listMotionPrompt(input);
        case 'music_prompt':
          return listMusicPrompt(input);
        case 'scene_script':
          return listSceneScript(input);
      }
    },
    async get(input: VersionInput & { versionId: string }) {
      switch (input.kind) {
        case 'image':
          return getImage(input);
        case 'video':
          return getVideo(input);
        case 'character_sheet':
          return getCharacterSheet(input);
        case 'location_sheet':
          return getLocationSheet(input);
        case 'music':
          return getMusic(input);
        case 'visual_prompt':
          return getVisualPrompt(input);
        case 'motion_prompt':
          return getMotionPrompt(input);
        case 'music_prompt':
          return getMusicPrompt(input);
        case 'scene_script':
          return getSceneScript(input);
      }
    },
  };
}
