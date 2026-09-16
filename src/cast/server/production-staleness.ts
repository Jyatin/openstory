import type { ScopedDb } from '@/platform/server/db/scoped';
import { buildRegenerateCharacterSheetPayload } from './sheets/character-sheet-trigger';
import { buildRegenerateLocationSheetPayload } from './sheets/location-sheet-trigger';
import {
  characterSheetHashMatchesStored,
  locationSheetHashMatchesStored,
} from './workflows/sheet-snapshots';

/** Compute with the same payload/hash functions as the editor, without dispatching work. */
export async function readReferenceStaleness(
  scopedDb: ScopedDb,
  sequenceId: string,
  kind: 'character' | 'location',
  entityId: string
) {
  const sequence = await scopedDb.productionInspection.getSequence(sequenceId);
  const context = {
    scopedDb,
    sequence,
    userId: scopedDb.userId,
    teamId: scopedDb.teamId,
  };
  if (kind === 'character') {
    const { character, sheet } = await scopedDb.castReads.getCharacter(
      sequenceId,
      entityId
    );
    if (character.voiceOnly)
      return { status: 'untracked' as const, applicable: false };
    if (character.sheetStatus === 'generating')
      return { status: 'generating' as const, applicable: true };
    if (!sheet?.inputHash)
      return { status: 'untracked' as const, applicable: true };
    const payload = await buildRegenerateCharacterSheetPayload({
      ...context,
      character: {
        ...character,
        sheetImageUrl: sheet.url,
        sheetImagePath: sheet.storagePath,
        sheetGeneratedAt: sheet.generatedAt,
        sheetInputHash: sheet.inputHash,
      },
    });
    return {
      status: (await characterSheetHashMatchesStored(sheet.inputHash, payload))
        ? ('fresh' as const)
        : ('stale' as const),
      applicable: true,
    };
  }
  const { location, sheet } = await scopedDb.castReads.getLocation(
    sequenceId,
    entityId
  );
  if (location.referenceStatus === 'generating')
    return { status: 'generating' as const, applicable: true };
  if (!sheet?.inputHash)
    return { status: 'untracked' as const, applicable: true };
  const payload = await buildRegenerateLocationSheetPayload({
    ...context,
    location: {
      ...location,
      referenceImageUrl: sheet.url,
      referenceImagePath: sheet.storagePath,
      referenceGeneratedAt: sheet.generatedAt,
      referenceInputHash: sheet.inputHash,
    },
  });
  return {
    status: (await locationSheetHashMatchesStored(sheet.inputHash, payload))
      ? ('fresh' as const)
      : ('stale' as const),
    applicable: true,
  };
}
