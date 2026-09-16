import { z } from 'zod';
import { createSelectSchema } from 'drizzle-orm/zod';
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
import { projectRead, readDate } from '@/platform/server/read-projection';
import type { createProductionHistoryReads } from './db/production-history';

export const versionKindSchema = z.enum([
  'image',
  'video',
  'character_sheet',
  'location_sheet',
  'music',
  'visual_prompt',
  'motion_prompt',
  'music_prompt',
  'scene_script',
]);
export type VersionKind = z.infer<typeof versionKindSchema>;
export const versionSummarySchema = z.object({
  id: z.string(),
  kind: versionKindSchema,
  entityId: z.string(),
  selected: z.boolean(),
  createdAt: readDate,
  model: z.string().nullable(),
  status: z.string(),
  url: z.string().nullable(),
  error: z.string().nullable(),
  discardedAt: readDate.nullable(),
});
export function inspectVersionSummary(
  row: {
    id: string;
    kind: VersionKind;
    entityId: string;
    selected: boolean;
    createdAt: Date;
    model?: string;
    analysisModel?: string | null;
    status?: string;
    url?: string | null;
    error?: string | null;
    discardedAt?: Date | null;
  },
  origin: string
) {
  return projectRead(
    versionSummarySchema,
    {
      ...row,
      model: row.model ?? row.analysisModel ?? null,
      status: row.status ?? 'completed',
      url: row.url ?? null,
      error: row.error ?? null,
      discardedAt: row.discardedAt ?? null,
    },
    origin
  );
}
const frameVariantsReadSchema = createSelectSchema(frameVariants)
  .pick({
    id: true,
    frameId: true,
    sequenceId: true,
    kind: true,
    model: true,
    resolution: true,
    sourceVariantId: true,
    url: true,
    status: true,
    workflowRunId: true,
    generatedAt: true,
    error: true,
    promptHash: true,
    inputHash: true,
    dependsOnVersionId: true,
    promptVersionId: true,
    discardedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    generatedAt: readDate.nullable(),
    discardedAt: readDate.nullable(),
  });
const videoVariantsReadSchema = createSelectSchema(videoVariants)
  .pick({
    id: true,
    renderSegmentId: true,
    sequenceId: true,
    model: true,
    resolution: true,
    manifest: true,
    url: true,
    status: true,
    workflowRunId: true,
    generatedAt: true,
    error: true,
    isPrimary: true,
    inputHash: true,
    discardedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    generatedAt: readDate.nullable(),
    discardedAt: readDate.nullable(),
    manifest: z.json(),
  });
const characterSheetVariantsReadSchema = createSelectSchema(
  characterSheetVariants
)
  .pick({
    id: true,
    characterId: true,
    model: true,
    url: true,
    status: true,
    workflowRunId: true,
    generatedAt: true,
    error: true,
    inputHash: true,
    divergedAt: true,
    discardedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    generatedAt: readDate.nullable(),
    discardedAt: readDate.nullable(),
    divergedAt: readDate.nullable(),
  });
const locationSheetVariantsReadSchema = createSelectSchema(
  locationSheetVariants
)
  .pick({
    id: true,
    parentType: true,
    parentId: true,
    model: true,
    url: true,
    status: true,
    workflowRunId: true,
    generatedAt: true,
    error: true,
    inputHash: true,
    divergedAt: true,
    discardedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    generatedAt: readDate.nullable(),
    discardedAt: readDate.nullable(),
    divergedAt: readDate.nullable(),
  });
const sequenceMusicVariantsReadSchema = createSelectSchema(
  sequenceMusicVariants
)
  .pick({
    id: true,
    sequenceId: true,
    url: true,
    loudnessGainDb: true,
    prompt: true,
    tags: true,
    durationSeconds: true,
    model: true,
    status: true,
    workflowRunId: true,
    generatedAt: true,
    error: true,
    inputHash: true,
    divergedAt: true,
    discardedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    generatedAt: readDate.nullable(),
    discardedAt: readDate.nullable(),
    divergedAt: readDate.nullable(),
  });
const framePromptVersionsReadSchema = createSelectSchema(framePromptVersions)
  .pick({
    id: true,
    frameId: true,
    text: true,
    components: true,
    source: true,
    inputHash: true,
    analysisModel: true,
    status: true,
    workflowRunId: true,
    createdAt: true,
    createdBy: true,
  })
  .extend({ createdAt: readDate, components: z.json().nullable() });
const shotPromptVersionsReadSchema = createSelectSchema(shotPromptVersions)
  .pick({
    id: true,
    shotId: true,
    promptType: true,
    text: true,
    components: true,
    parameters: true,
    dialogue: true,
    audio: true,
    source: true,
    audioClips: true,
    usesStartFrame: true,
    inputHash: true,
    analysisModel: true,
    status: true,
    workflowRunId: true,
    createdAt: true,
    createdBy: true,
  })
  .extend({
    createdAt: readDate,
    components: z.json().nullable(),
    parameters: z.json().nullable(),
    dialogue: z.json().nullable(),
    audio: z.json().nullable(),
    audioClips: z.json().nullable(),
  });
const sequenceMusicPromptVersionsReadSchema = createSelectSchema(
  sequenceMusicPromptVersions
)
  .pick({
    id: true,
    sequenceId: true,
    promptType: true,
    prompt: true,
    tags: true,
    source: true,
    inputHash: true,
    analysisModel: true,
    createdAt: true,
    createdBy: true,
  })
  .extend({ createdAt: readDate });
const sceneScriptVersionsReadSchema = createSelectSchema(sceneScriptVersions)
  .pick({
    id: true,
    sceneId: true,
    content: true,
    source: true,
    createdAt: true,
    createdBy: true,
  })
  .extend({ createdAt: readDate, content: z.json() });

export function inspectVersion(
  read: Awaited<
    ReturnType<ReturnType<typeof createProductionHistoryReads>['get']>
  >,
  origin: string
) {
  switch (read.kind) {
    case 'image':
      return {
        selected: read.selected,
        ...projectRead(frameVariantsReadSchema, read.row, origin),
      };
    case 'video':
      return {
        selected: read.selected,
        ...projectRead(videoVariantsReadSchema, read.row, origin),
      };
    case 'character_sheet':
      return {
        selected: read.selected,
        ...projectRead(characterSheetVariantsReadSchema, read.row, origin),
      };
    case 'location_sheet':
      return {
        selected: read.selected,
        ...projectRead(locationSheetVariantsReadSchema, read.row, origin),
      };
    case 'music':
      return {
        selected: read.selected,
        ...projectRead(sequenceMusicVariantsReadSchema, read.row, origin),
      };
    case 'visual_prompt':
      return {
        selected: read.selected,
        ...projectRead(framePromptVersionsReadSchema, read.row, origin),
      };
    case 'motion_prompt':
      return {
        selected: read.selected,
        ...projectRead(shotPromptVersionsReadSchema, read.row, origin),
      };
    case 'music_prompt':
      return {
        selected: read.selected,
        ...projectRead(sequenceMusicPromptVersionsReadSchema, read.row, origin),
      };
    case 'scene_script':
      return {
        selected: read.selected,
        ...projectRead(sceneScriptVersionsReadSchema, read.row, origin),
      };
  }
}
