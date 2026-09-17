import { listFilesPage } from '#storage';
import { STORAGE_BUCKETS } from '@/platform/server/storage/buckets';
import {
  scopedPageCursor,
  type ScopedPageInput,
} from '@/platform/server/db/scoped-read-page';

export async function listStudioUploadReads(
  teamId: string,
  input: ScopedPageInput
) {
  const scope = [teamId, 'studio-uploads'];
  const cursor = scopedPageCursor(input, scope);
  const page = await listFilesPage(STORAGE_BUCKETS.TALENT, `${teamId}/temp`, {
    limit: input.limit,
    cursor: cursor ?? undefined,
  });
  return {
    uploads: page.files.filter((file) =>
      /^(image|video|audio)\//.test(file.contentType)
    ),
    examined: page.files.length,
    nextCursor: page.nextCursor
      ? btoa(JSON.stringify({ scope, id: page.nextCursor }))
      : null,
  };
}
