/** MCP wire tests backed by the real scoped repositories and migrated SQLite schema. */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
// oxlint-disable-next-line boundaries/no-raw-db -- substitute the isolated in-memory DB at the factory boundary
import { getDb } from '#db-client';
import type { Database } from '@/platform/server/db/client';
// oxlint-disable-next-line boundaries/no-scoped-factory -- exercise real team-scoped repositories, not mocked authorization
import { createScopedDb } from '@/platform/server/db/scoped';
import { generateId } from '@/platform/id';
import { relations } from '@/platform/server/db/schema/relations';
import {
  frames,
  frameVariants,
  framePromptVersions,
  scenes,
  sceneScriptVersions,
  sequences,
  shots,
  shotPromptVersions,
  styles,
  teams,
  renderSegments,
  videoVariants,
  sequenceExports,
} from '@/platform/server/db/schema';
import { dbSceneId } from '@/shots/scene-id';
import {
  shotInspectionSchema,
  sceneDetailSchema,
} from '@/shots/inspection.schema';
import { serializeShot } from '@/shots/server/inspection';
import { registerListSequences } from './tools/list-sequences';
import { registerGetSequence } from './tools/get-sequence';
import { registerGetSequenceStatus } from './tools/get-sequence-status';
import { registerListScenes } from './tools/list-scenes';
import { registerGetScene } from './tools/get-scene';
import { registerListShots } from './tools/list-shots';
import { registerGetShot } from './tools/get-shot';

vi.mock('#db-client', () => ({ getDb: vi.fn() }));
let client: Client;
let db: Database;
let teamId: string;
let sequenceId: string;
let sceneId: string;
let shotId: string;
let frameId: string;
let segmentId: string;
let imageId: string;
let videoId: string;
let scopedDb: ReturnType<typeof createScopedDb>;
const queries: string[] = [];
const registrations = [
  registerListSequences,
  registerGetSequence,
  registerGetSequenceStatus,
  registerListScenes,
  registerGetScene,
  registerListShots,
  registerGetShot,
];
const handler = createMcpHandler(
  () => {
    const server = new McpServer(
      { name: 'test', version: '1' },
      { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
    );
    for (const register of registrations)
      register(server, () => ({ scopedDb, origin: 'https://openstory.test' }));
    return server;
  },
  { legacy: 'reject' }
);
async function call(name: string, args: Record<string, unknown> = {}) {
  const response = await handler.fetch(
    new Request('https://openstory.test/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': `openstory.${name}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: `openstory.${name}`,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'vitest',
              version: '1',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    })
  );
  const envelope = z
    .object({
      result: z
        .object({
          isError: z.boolean().optional(),
          structuredContent: z.record(z.string(), z.unknown()).optional(),
          content: z.array(z.object({ type: z.string(), text: z.string() })),
        })
        .optional(),
      error: z.unknown().optional(),
    })
    .parse(await response.json());
  expect(envelope.error).toBeUndefined();
  if (!envelope.result) throw new Error('Missing tool result');
  return envelope.result;
}
async function data(name: string, args: Record<string, unknown>) {
  const result = await call(name, args);
  expect(result.isError, JSON.stringify(result)).not.toBe(true);
  return result.structuredContent;
}
async function addShot(parent = sceneId, number = 2) {
  const id = generateId();
  await db.insert(shots).values({
    id,
    sequenceId,
    sceneId: dbSceneId(parent),
    shotNumber: number,
    durationMs: 4000,
  });
  return id;
}
async function addScene(orderIndex: number) {
  const id = dbSceneId(generateId());
  await db
    .insert(scenes)
    .values({ id, sequenceId, orderIndex, title: 'Another scene' });
  return id;
}
beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  db = drizzle({
    client,
    relations,
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  });
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  vi.mocked(getDb).mockReturnValue(db);
});
afterAll(() => {
  client.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv('R2_PUBLIC_STORAGE_DOMAIN', undefined);
  teamId = generateId();
  sequenceId = generateId();
  sceneId = generateId();
  shotId = generateId();
  frameId = generateId();
  segmentId = generateId();
  imageId = generateId();
  videoId = generateId();
  await db.insert(teams).values({ id: teamId, name: 'T', slug: teamId });
  const styleId = generateId();
  await db.insert(styles).values({
    id: styleId,
    teamId,
    name: 'Noir',
    config: {
      mood: 'neutral',
      artStyle: 'cinematic',
      lighting: 'natural',
      colorPalette: ['#000'],
      cameraWork: 'static',
      referenceFilms: [],
      colorGrading: 'neutral',
    },
  });
  await db.insert(sequences).values({
    id: sequenceId,
    teamId,
    title: 'Test sequence',
    styleId,
    status: 'completed',
    generateStartFrames: true,
  });
  const scriptId = generateId();
  await db.insert(scenes).values({
    id: dbSceneId(sceneId),
    sequenceId,
    orderIndex: 0,
    title: 'Opening',
    selectedScriptVersionId: scriptId,
  });
  await db.insert(sceneScriptVersions).values({
    id: scriptId,
    sceneId,
    content: { extract: 'Selected script', dialogue: [] },
    source: 'edit',
  });
  await db.insert(renderSegments).values({
    id: segmentId,
    sequenceId,
    sceneId,
    selectedVideoVersionId: videoId,
  });
  await db.insert(shots).values({
    id: shotId,
    sequenceId,
    sceneId: dbSceneId(sceneId),
    shotNumber: 1,
    durationMs: 3000,
    renderSegmentId: segmentId,
  });
  await db.insert(frames).values({
    id: frameId,
    shotId,
    sequenceId,
    selectedImageVersionId: imageId,
    imageStatus: 'completed',
  });
  await db.insert(frameVariants).values({
    id: imageId,
    frameId,
    sequenceId,
    model: 'nano_banana_2',
    status: 'completed',
    url: '/r2/openstory-images/still.png',
  });
  await db.insert(videoVariants).values({
    id: videoId,
    sequenceId,
    renderSegmentId: segmentId,
    model: 'wan_i2v',
    manifest: [],
    status: 'completed',
    isPrimary: true,
    url: '/r2/openstory-videos/clip.mp4',
  });
  const visualId = generateId(),
    motionId = generateId();
  await db.insert(framePromptVersions).values({
    id: visualId,
    frameId,
    text: 'Visual prompt',
    source: 'user-edit',
  });
  await db.insert(shotPromptVersions).values({
    id: motionId,
    shotId,
    promptType: 'motion',
    text: 'Motion prompt',
    source: 'user-edit',
  });
  await db
    .update(frames)
    .set({ selectedImagePromptVersionId: visualId })
    .where(eq(frames.id, frameId));
  await db
    .update(shots)
    .set({ selectedMotionPromptVersionId: motionId })
    .where(eq(shots.id, shotId));
  scopedDb = createScopedDb(teamId, generateId());
  queries.length = 0;
});

describe('entity identity and team ownership', () => {
  it.each([
    'get_sequence',
    'get_sequence_status',
    'list_scenes',
    'get_scene',
    'list_shots',
    'get_shot',
  ])('%s rejects a foreign team before child reads', async (name) => {
    scopedDb = createScopedDb(generateId(), generateId());
    const args = {
      sequenceId,
      ...(name === 'get_scene' ? { sceneId } : {}),
      ...(name === 'get_shot' ? { shotId } : {}),
    };
    expect(await call(name, args)).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'NOT_FOUND' } },
    });
    expect(queries).toHaveLength(1);
  });
  it('lists only the current team', async () => {
    expect(await data('list_sequences', {})).toMatchObject({
      sequences: [{ id: sequenceId }],
      nextCursor: null,
    });
    scopedDb = createScopedDb(generateId(), generateId());
    expect(await data('list_sequences', {})).toEqual({
      sequences: [],
      nextCursor: null,
    });
  });
  it('rejects wrong entity IDs, missing IDs and unknown selector fields', async () => {
    for (const [name, args] of [
      ['get_scene', { sequenceId, shotId }],
      ['get_scene', { sequenceId, sceneId: shotId }],
      ['get_scene', { sequenceId, sceneId, shotId }],
      ['get_shot', { sequenceId, sceneId }],
      ['get_shot', { sequenceId, shotId: sceneId }],
      ['get_shot', { sequenceId, shotId: 'not-a-ulid' }],
    ] as const)
      expect((await call(name, args)).isError).toBe(true);
  });
  it('rejects wrong-sequence children and scene filters, including empty scenes', async () => {
    const other = generateId();
    const [seq] = await db
      .select()
      .from(sequences)
      .where(eq(sequences.id, sequenceId));
    if (!seq) throw new Error('fixture');
    await db
      .insert(sequences)
      .values({ id: other, teamId, title: 'Other', styleId: seq.styleId });
    for (const [name, args] of [
      ['get_scene', { sceneId }],
      ['get_shot', { shotId }],
      ['list_shots', { sceneId }],
    ] as const)
      expect(await call(name, { sequenceId: other, ...args })).toMatchObject({
        isError: true,
        structuredContent: { error: { code: 'NOT_FOUND' } },
      });
  });
});

describe('scene and shot projections', () => {
  it('returns matching selected versions and prompts through scene and shot detail', async () => {
    const shot = shotInspectionSchema.parse(
      await data('get_shot', { sequenceId, shotId })
    );
    const scene = sceneDetailSchema.parse(
      await data('get_scene', { sequenceId, sceneId })
    );
    expect(scene.shots).toEqual([shot]);
    expect(scene.script?.content.extract).toBe('Selected script');
    expect(shot).toMatchObject({
      id: shotId,
      sceneId,
      durationMs: 3000,
      effectiveUseStartFrame: true,
      anchorFrame: {
        id: frameId,
        prompt: 'Visual prompt',
        selectedImage: {
          versionId: imageId,
          usable: true,
          url: 'https://openstory.test/r2/openstory-images/still.png',
        },
      },
      motion: {
        prompt: 'Motion prompt',
        selectedVideo: { versionId: videoId, usable: true },
      },
    });
    expect(queries.some((q) => /^(insert|update|delete)/i.test(q))).toBe(false);
  });
  it('keeps frameless shots visible and resolves reference-only mode without repairing data', async () => {
    const id = await addShot();
    await db
      .update(shots)
      .set({ useStartFrame: false })
      .where(eq(shots.id, id));
    queries.length = 0;
    expect(await data('get_shot', { sequenceId, shotId: id })).toMatchObject({
      id,
      anchorFrame: null,
      effectiveUseStartFrame: false,
    });
    expect(queries.some((q) => /^(insert|update|delete)/i.test(q))).toBe(false);
  });
  it('omits optional payloads from default lists and does not select prompt text', async () => {
    const result = await data('list_shots', { sequenceId });
    const page = z
      .object({ shots: z.array(shotInspectionSchema) })
      .parse(result);
    expect(page.shots[0]?.motion.prompt).toBeUndefined();
    expect(page.shots[0]?.anchorFrame?.selectedImage.url).toBeUndefined();
    expect(
      queries.some((q) =>
        q
          .slice(0, q.indexOf(' from '))
          .includes('"frame_prompt_versions"."text"')
      )
    ).toBe(false);
    expect(
      await data('list_shots', {
        sequenceId,
        includePrompts: true,
        includeAssets: true,
      })
    ).toMatchObject({ shots: [{ motion: { prompt: 'Motion prompt' } }] });
  });
  it('serializes loaded data without any database access', async () => {
    const read = await scopedDb.shots.getDetail(sequenceId, shotId);
    queries.length = 0;
    expect(
      serializeShot(
        read,
        { generateStartFrames: true },
        'https://openstory.test',
        { includeAssets: true, includePrompts: true }
      ).id
    ).toBe(shotId);
    expect(queries).toEqual([]);
  });
  it('returns the JSON data in text for clients without structured-result support', async () => {
    const result = await call('get_shot', { sequenceId, shotId });
    expect(JSON.parse(result.content[1]?.text ?? '')).toEqual(
      result.structuredContent
    );
  });
});

describe('paging and deleted children', () => {
  it('pages shots in scene/shot order, filters scenes, and binds cursors to the filter', async () => {
    const second = await addShot();
    const otherScene = await addScene(1);
    const third = await addShot(otherScene, 1);
    const shape = z.object({
      shots: z.array(shotInspectionSchema),
      nextCursor: z.string().nullable(),
    });
    const first = shape.parse(
      await data('list_shots', { sequenceId, limit: 1 })
    );
    expect(first.shots.map((s) => s.id)).toEqual([shotId]);
    const rest = shape.parse(
      await data('list_shots', {
        sequenceId,
        limit: 10,
        cursor: first.nextCursor,
      })
    );
    expect(rest.shots.map((s) => s.id)).toEqual([second, third]);
    expect(rest.nextCursor).toBeNull();
    expect(
      (
        await call('list_shots', {
          sequenceId,
          sceneId,
          cursor: first.nextCursor,
        })
      ).isError
    ).toBe(true);
    expect(
      shape
        .parse(await data('list_shots', { sequenceId, sceneId: otherScene }))
        .shots.map((s) => s.id)
    ).toEqual([third]);
    const emptyScene = await addScene(2);
    expect(
      await data('list_shots', { sequenceId, sceneId: emptyScene })
    ).toEqual({ sequenceId, shots: [], nextCursor: null });
  });
  it('pages scenes and bounds nested children with explicit truncation', async () => {
    for (let i = 2; i <= 7; i++) await addShot(sceneId, i);
    const nextScene = await addScene(1);
    const shape = z.object({
      scenes: z.array(
        z.object({
          id: z.string(),
          shots: z.array(shotInspectionSchema),
          shotsTruncated: z.boolean(),
        })
      ),
      nextCursor: z.string().nullable(),
    });
    const first = shape.parse(
      await data('list_scenes', { sequenceId, limit: 1 })
    );
    expect(first.scenes[0]?.shots).toHaveLength(5);
    expect(first.scenes[0]?.shotsTruncated).toBe(true);
    expect(
      shape
        .parse(
          await data('list_scenes', { sequenceId, cursor: first.nextCursor })
        )
        .scenes.map((s) => s.id)
    ).toEqual([nextScene]);
    expect(
      (await call('list_scenes', { sequenceId, cursor: 'bad' })).isError
    ).toBe(true);
    expect((await call('list_sequences', { cursor: 'bad' })).isError).toBe(
      true
    );
  });
  it('excludes deleted shots and children of deleted scenes from reads and counts', async () => {
    const hiddenScene = await addScene(1);
    const hiddenShot = await addShot(hiddenScene);
    await db
      .update(scenes)
      .set({ deletedAt: new Date() })
      .where(eq(scenes.id, hiddenScene));
    expect(await data('get_sequence_status', { sequenceId })).toMatchObject({
      counts: { shots: 1 },
    });
    expect(
      (await call('get_shot', { sequenceId, shotId: hiddenShot })).isError
    ).toBe(true);
    expect(
      (await call('get_scene', { sequenceId, sceneId: hiddenScene })).isError
    ).toBe(true);
    await db
      .update(shots)
      .set({ deletedAt: new Date() })
      .where(eq(shots.id, shotId));
    expect(await data('list_shots', { sequenceId })).toMatchObject({
      shots: [],
    });
    expect((await call('get_shot', { sequenceId, shotId })).isError).toBe(true);
  });
});

describe('status and result limits', () => {
  it('shares partially-ready counts across summaries and keeps selected assets after failed attempts', async () => {
    await db
      .update(frames)
      .set({ imageStatus: 'failed', imageError: 'Image failed' })
      .where(eq(frames.id, frameId));
    const failedId = generateId();
    await db.insert(videoVariants).values({
      id: failedId,
      sequenceId,
      renderSegmentId: segmentId,
      model: 'wan_i2v',
      manifest: [],
      status: 'failed',
      isPrimary: true,
      error: 'Video failed',
    });
    const status = await data('get_sequence_status', {
      sequenceId,
      includeFailures: true,
    });
    expect(status).toMatchObject({
      status: 'partially_ready',
      counts: {
        imagesReady: 1,
        imagesFailed: 1,
        videosReady: 1,
        videosFailed: 1,
      },
      failures: [{ stage: 'image' }, { stage: 'motion' }],
    });
    expect(await data('get_sequence', { sequenceId })).toMatchObject({
      status: 'partially_ready',
      counts: status?.counts,
    });
    expect(await data('list_sequences', {})).toMatchObject({
      sequences: [{ status: 'partially_ready', counts: status?.counts }],
    });
    expect(await data('get_shot', { sequenceId, shotId })).toMatchObject({
      anchorFrame: { status: 'failed', selectedImage: { usable: true } },
      motion: { status: 'failed', selectedVideo: { versionId: videoId } },
    });
  });
  it('counts shared segments once, exposes active workflows and retains processing lifecycle', async () => {
    const second = await addShot();
    await db
      .update(shots)
      .set({ renderSegmentId: segmentId })
      .where(eq(shots.id, second));
    await db
      .update(sequences)
      .set({ status: 'processing', workflowRunId: 'story-run' })
      .where(eq(sequences.id, sequenceId));
    await db
      .update(frames)
      .set({ imageStatus: 'generating', imageWorkflowRunId: 'image-run' })
      .where(eq(frames.id, frameId));
    await db
      .update(videoVariants)
      .set({ status: 'generating', workflowRunId: 'video-run' })
      .where(eq(videoVariants.id, videoId));
    await db.insert(sequenceExports).values({
      sequenceId,
      url: '',
      storagePath: '',
      status: 'processing',
      workflowRunId: 'export-run',
    });
    expect(await data('get_sequence_status', { sequenceId })).toMatchObject({
      status: 'processing',
      counts: { shots: 2, renderSegments: 1 },
      workflowRunIds: ['story-run', 'image-run', 'video-run', 'export-run'],
    });
  });
  it('does not treat an optional failed start frame as blocking a reference-only shot', async () => {
    await db
      .update(shots)
      .set({ useStartFrame: false })
      .where(eq(shots.id, shotId));
    await db
      .update(frames)
      .set({ imageStatus: 'failed' })
      .where(eq(frames.id, frameId));
    expect(await data('get_sequence_status', { sequenceId })).toMatchObject({
      status: 'completed',
      counts: { imagesFailed: 1 },
    });
  });
  it('does not count selected versions without a URL as usable', async () => {
    await db
      .update(frameVariants)
      .set({ url: null })
      .where(eq(frameVariants.id, imageId));
    await db
      .update(videoVariants)
      .set({ url: null })
      .where(eq(videoVariants.id, videoId));
    expect(await data('list_shots', { sequenceId })).toMatchObject({
      shots: [
        {
          anchorFrame: { selectedImage: { versionId: imageId, usable: false } },
          motion: { selectedVideo: { versionId: videoId, usable: false } },
        },
      ],
    });
    expect(await data('get_sequence_status', { sequenceId })).toMatchObject({
      counts: { imagesReady: 0, videosReady: 0 },
    });
  });
  it('keeps active exports visible even when there are more than 100 newer failures', async () => {
    const activeId = generateId();
    await db.insert(sequenceExports).values({
      id: activeId,
      sequenceId,
      url: '',
      storagePath: '',
      status: 'processing',
      workflowRunId: 'active-export',
    });
    for (let i = 0; i < 101; i++)
      await db.insert(sequenceExports).values({
        sequenceId,
        url: '',
        storagePath: '',
        status: 'failed',
        error: 'Export failed',
      });
    expect(
      await data('get_sequence_status', { sequenceId, includeFailures: true })
    ).toMatchObject({
      workflowRunIds: ['active-export'],
      activeExports: [{ id: activeId, workflowRunId: 'active-export' }],
      exportsTruncated: false,
      failuresTruncated: true,
    });
  });
  it('caps oversized results without silently truncating prompt text', async () => {
    await db
      .update(framePromptVersions)
      .set({ text: 'x'.repeat(300000) })
      .where(eq(framePromptVersions.frameId, frameId));
    const result = await call('get_shot', { sequenceId, shotId });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('256 KiB');
    expect(result.structuredContent).toBeUndefined();
  });
  it('does not leak internal exceptions', async () => {
    const fail = vi
      .spyOn(scopedDb.shots, 'getDetail')
      .mockRejectedValueOnce(new Error('private database password'));
    const result = await call('get_shot', { sequenceId, shotId });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private database password');
    fail.mockRestore();
  });
});
