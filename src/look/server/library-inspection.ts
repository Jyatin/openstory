import type { Style } from '@/platform/server/db/schema';
import { buildSampleEntries } from '@/look/ui/sample-entries';
import {
  styleHoverVideoUrl,
  stylePreviewImageUrls,
} from '@/look/ui/style-assets';
import { z } from 'zod';
import { createSelectSchema } from 'drizzle-orm/zod';
import { styles, audio, vfx } from '@/platform/server/db/schema';
import { projectRead } from '@/platform/server/read-projection';
import type { LibraryReadKind } from './db/library-reads';

const schemas = {
  style: createSelectSchema(styles, {
    config: z.json(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).pick({
    id: true,
    name: true,
    description: true,
    config: true,
    category: true,
    tags: true,
    isPublic: true,
    isTemplate: true,
    version: true,
    previewUrl: true,
    sampleVideos: true,
    recommendedImageModel: true,
    recommendedVideoModel: true,
    defaultAspectRatio: true,
    useCases: true,
    sortOrder: true,
    usageCount: true,
    createdAt: true,
    updatedAt: true,
  }),
  audio: createSelectSchema(audio, {
    metadata: z.json(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).pick({
    id: true,
    name: true,
    fileUrl: true,
    durationMs: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
  }),
  vfx: createSelectSchema(vfx, {
    presetConfig: z.json(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).pick({
    id: true,
    name: true,
    presetConfig: true,
    previewUrl: true,
    createdAt: true,
    updatedAt: true,
  }),
};
export function inspectLibraryResource(
  kind: LibraryReadKind,
  row: unknown,
  origin: string
) {
  return projectRead(schemas[kind], row, origin);
}

export function inspectGalleryStyle(row: Style, origin: string) {
  return {
    ...projectRead(schemas.style, row, origin),
    gallery: projectRead(
      z.object({
        sample: z.json(),
        hoverVideoUrl: z.string().nullable(),
        previewImages: z.array(z.object({ url: z.string() })),
      }),
      {
        sample: buildSampleEntries([row])[0] ?? null,
        hoverVideoUrl: styleHoverVideoUrl(row),
        previewImages: stylePreviewImageUrls(row).map((url) => ({ url })),
      },
      origin
    ),
  };
}
