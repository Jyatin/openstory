import { z } from 'zod';
import { createSelectSchema } from 'drizzle-orm/zod';
import { generatedAssets } from '@/platform/server/db/schema';
import { projectRead } from '@/platform/server/read-projection';
const assetSchema = createSelectSchema(generatedAssets, {
  input: z.json(),
  outputs: z
    .array(z.object({ url: z.string(), contentType: z.string() }))
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).pick({
  id: true,
  provider: true,
  endpointId: true,
  activity: true,
  modelName: true,
  source: true,
  isFavorite: true,
  input: true,
  status: true,
  outputs: true,
  error: true,
  workflowRunId: true,
  costMicros: true,
  createdAt: true,
  updatedAt: true,
});
export function inspectAsset(row: unknown, origin: string) {
  return projectRead(assetSchema, row, origin);
}
