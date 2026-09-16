import { usesVoice } from '@/cast/voice';
import { z } from 'zod';
import { createSelectSchema } from 'drizzle-orm/zod';
import {
  characters,
  sequenceLocations,
  sequenceElements,
} from '@/platform/server/db/schema';
import { projectRead, readDate } from '@/platform/server/read-projection';
import type { createCastProductionReads } from './db/production-reads';

const referenceSchema = z.object({
  id: z.string(),
  url: z.string().nullable(),
  model: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  inputHash: z.string().nullable(),
  generatedAt: readDate.nullable(),
});
export const characterReadSchema = createSelectSchema(characters)
  .pick({
    id: true,
    sequenceId: true,
    characterId: true,
    name: true,
    talentId: true,
    age: true,
    gender: true,
    ethnicity: true,
    physicalDescription: true,
    standardClothing: true,
    distinguishingFeatures: true,
    personality: true,
    movement: true,
    voiceOnly: true,
    voiceId: true,
    voiceDescription: true,
    useVoice: true,
    consistencyTag: true,
    firstMentionSceneId: true,
    firstMentionText: true,
    firstMentionLine: true,
    sheetStatus: true,
    sheetError: true,
    selectedSheetVersionId: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    effectiveUseVoice: z.boolean(),
    voicePreviews: z
      .array(z.object({ generatedVoiceId: z.string(), url: z.string() }))
      .nullable(),
    selectedSheet: referenceSchema.nullable(),
  });
export const locationReadSchema = createSelectSchema(sequenceLocations)
  .pick({
    id: true,
    sequenceId: true,
    locationId: true,
    libraryLocationId: true,
    name: true,
    type: true,
    timeOfDay: true,
    description: true,
    architecturalStyle: true,
    keyFeatures: true,
    colorPalette: true,
    lightingSetup: true,
    ambiance: true,
    consistencyTag: true,
    firstMentionSceneId: true,
    firstMentionText: true,
    firstMentionLine: true,
    referenceStatus: true,
    referenceError: true,
    selectedReferenceVersionId: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    selectedReference: referenceSchema.nullable(),
  });
export const elementReadSchema = createSelectSchema(sequenceElements)
  .pick({
    id: true,
    sequenceId: true,
    uploadedFilename: true,
    token: true,
    kind: true,
    durationSeconds: true,
    description: true,
    consistencyTag: true,
    visionStatus: true,
    visionError: true,
    firstMentionSceneId: true,
    firstMentionText: true,
    firstMentionLine: true,
  })
  .extend({
    createdAt: readDate,
    updatedAt: readDate,
    visionGeneratedAt: readDate.nullable(),
    url: z.string().nullable(),
  });

type Reads = ReturnType<typeof createCastProductionReads>;
export function inspectCharacter(
  row: Awaited<ReturnType<Reads['getCharacter']>>,
  generateVoices: boolean,
  origin: string
) {
  return projectRead(
    characterReadSchema,
    {
      ...row.character,
      effectiveUseVoice: usesVoice(row.character, { generateVoices }),
      selectedSheet: row.sheet,
    },
    origin
  );
}
export function inspectLocation(
  row: Awaited<ReturnType<Reads['getLocation']>>,
  origin: string
) {
  return projectRead(
    locationReadSchema,
    { ...row.location, selectedReference: row.sheet },
    origin
  );
}
export function inspectElement(
  row: Awaited<ReturnType<Reads['getElement']>>,
  origin: string
) {
  return projectRead(elementReadSchema, { ...row, url: row.imageUrl }, origin);
}
