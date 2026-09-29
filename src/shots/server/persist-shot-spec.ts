/**
 * Analysis persists each shot's spec as its first version, and the still and
 * motion prompts derived from it (#1915, #1919). One path for every shot:
 * the per-shot prompt LLMs never author a fresh run's first prompts.
 */

import type { WorkflowScopedDb } from '@/platform/server/db/scoped-workflow';
import {
  hashMotionPromptInput,
  hashVisualPromptInput,
} from '@/shots/input-hash';
import type { VisualPromptHashInput } from '@/shots/input-hash';
import { narrowShotPromptContext } from '@/shots/server/prompt-context';
import { shotDialogue } from '@/shots/shot-dialogue';
import {
  deriveMotionPrompt,
  deriveStillPrompt,
} from '@/shots/shot-list.derive';
import { storedShotSpec } from '@/shots/shot-list.schema';
import { shotSpecForItem, type ShotWorkItem } from './shot-work-items';

/**
 * Write one shot's spec and derived prompts; returns whether a still prompt
 * was written (a reference-only shot has none). Throws when the shot has no
 * spec or, off reference-only, no frame: the batch skips the LLM for any
 * scene whose shots carry specs, so a quiet skip here leaves a shot with no
 * prompts at all.
 */
export async function persistShotSpec(
  scopedDb: Pick<
    WorkflowScopedDb,
    'shotSpecVersions' | 'framePromptVersions' | 'shotPromptVersions'
  >,
  item: ShotWorkItem,
  context: Omit<VisualPromptHashInput, 'scene'> & { referenceOnly: boolean }
): Promise<{ stillPrompt: boolean }> {
  const { shotId, frameId, shotNumber } = item.mapping;
  const spec = shotSpecForItem(item);
  const where = `scene ${item.scene.sceneId} shot ${shotNumber} (${shotId})`;
  if (!spec) throw new Error(`Shot spec missing for ${where}`);

  const { referenceOnly } = context;
  if (!referenceOnly && frameId === null) {
    throw new Error(`No frame to hold the still prompt for ${where}`);
  }
  const stored = storedShotSpec(spec);
  const version = await scopedDb.shotSpecVersions.write({
    shotId,
    spec: stored,
    source: 'analysis',
    createdBy: null,
  });
  // Derivation consumes no rendered still: the hash says so (#1892).
  const narrowed = narrowShotPromptContext({
    ...context,
    scene: item.scene,
    startingFrameImageUrl: null,
    dialogue: shotDialogue(item.scene.originalScript.dialogue),
  });

  if (!referenceOnly && frameId !== null) {
    await scopedDb.framePromptVersions.write({
      frameId,
      source: 'derived',
      specVersionId: version.id,
      text: deriveStillPrompt(stored, item.scene, context.styleConfig),
      inputHash: await hashVisualPromptInput(narrowed),
      analysisModel: context.analysisModel,
    });
  }
  const motion = deriveMotionPrompt(stored, { referenceOnly });
  await scopedDb.shotPromptVersions.write({
    shotId,
    promptType: 'motion',
    source: 'derived',
    specVersionId: version.id,
    text: motion.text,
    audio: motion.audio,
    usesStartFrame: !referenceOnly,
    inputHash: await hashMotionPromptInput(narrowed),
    analysisModel: context.analysisModel,
  });
  return { stillPrompt: !referenceOnly };
}
