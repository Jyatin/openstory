# MCP production read coverage

This branch implements **34 production read tools plus `whoami`** at `/mcp`. It expands [#1458](https://github.com/openstory-so/openstory/issues/1458) from sequence/scene/shot inspection to the active sequence production graph. Every production tool requires `sequences:read` for OAuth; existing API keys retain their unscoped semantics.

## Registered tools

Every name below has the `openstory.` prefix.

| Area                   | Tools                                                                                                                         | Content                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production navigation  | `list_sequences`, `get_sequence`, `get_sequence_status`, `list_scenes`, `get_scene`, `list_shots`, `get_shot`                 | Sequence summaries, selected scripts, narrative/continuity, shot parameters, selected images/videos/prompts, aggregate failures and active work references                               |
| Characters             | `list_characters`, `get_character`                                                                                            | Appearance, clothing, performance, analysis label, linked talent ID, first mention, selected reference sheet, generation status, assigned voice, voice previews and effective voice mode |
| Locations              | `list_locations`, `get_location`                                                                                              | Environment/design/lighting, analysis label, linked library ID, first mention, selected reference sheet and generation status                                                            |
| Elements               | `list_elements`, `get_element`                                                                                                | Script token, image/video/audio kind, filename, description, media URL, duration, first mention and analysis status                                                                      |
| Sequence configuration | `get_sequence_settings`                                                                                                       | Model defaults, dimensions, target duration, music/voice/start-frame flags, pipeline/stop settings and effective style snapshot (normalised to v2)                                       |
| Script                 | `get_sequence_script`                                                                                                         | Original or composed script; composed uses active selected scene versions, falling back to original before any script is available                                                       |
| Frames                 | `list_frames`, `get_frame`                                                                                                    | Every frame role and order, selected image/prompt IDs, pending selection, status and error                                                                                               |
| Render segments        | `list_render_segments`, `get_render_segment`                                                                                  | Scene ownership, selected/pending video IDs and paged current shot membership                                                                                                            |
| Histories              | `list_versions`, `get_version`                                                                                                | Nine explicitly supported history kinds, including discarded versions when requested, selected state, media links and full version content                                               |
| Music and audio        | `get_sequence_music`, `get_shot_audio`                                                                                        | Current music state/prompt/tags and the shot's working dialogue clips; historical clips and audio direction are in motion-prompt versions                                                |
| Reference usage        | `list_shot_references`, `list_entity_usages`                                                                                  | Both directions between shots and characters/locations/elements, using the existing scene/reference matching functions                                                                   |
| Freshness              | `get_shot_staleness`, `list_shot_staleness`, `get_reference_staleness`, `get_render_segment_staleness`, `get_music_staleness` | Existing product hash/pointer semantics for prompts, images, reference sheets, video manifests and music prompts                                                                         |
| Activity               | `list_sequence_events`, `get_sequence_event`                                                                                  | Event metadata, entity/version references and the stored change details                                                                                                                  |
| Exports                | `list_exports`, `get_export_status`                                                                                           | Existing ready/processing/failed exports, source-cut hash, duration, workflow ID, error and URL; no render or reconciliation side effects                                                |

## Version navigation

`list_versions` takes `sequenceId`, `kind`, `entityId`, `limit`, optional `cursor`, and `includeDiscarded` (default false). `get_version` adds `versionId` and document-window arguments.

| `kind`            | Meaning of `entityId`              | Full version detail                                                                                                      |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `image`           | Frame ID                           | Image URL, model, resolution, framing/upload/preview kind, prompt dependency, hashes and generation state                |
| `video`           | Render-segment ID                  | Video URL, model, resolution and immutable input manifest, including covered shot/frame/prompt/audio identities          |
| `character_sheet` | Sequence-character database ID     | Sheet output, model, hash, generation/divergence/discard state                                                           |
| `location_sheet`  | Sequence-location database ID      | Reference output/model/hash and generation/divergence/discard state; library-location sheets are a different parent type |
| `music`           | Sequence ID (same as `sequenceId`) | Track URL, model, prompt/tags, duration, loudness and divergence/discard state                                           |
| `visual_prompt`   | Frame ID                           | Full text, structured components, source/model/hash, author and lifecycle                                                |
| `motion_prompt`   | Shot ID                            | Full text, components, parameters, dialogue, audio direction, captured clips, mode, source/model/hash and author         |
| `music_prompt`    | Sequence ID (same as `sequenceId`) | Full prompt/tags, source/model/hash and author                                                                           |
| `scene_script`    | Scene ID                           | Script extract, dialogue, source and author                                                                              |

Character/location selection resolves the existing legacy fallback when the selection pointer is null. Music has no selected-version pointer: track matches use output URL and model; prompt matches use text and tags. Multiple history rows may therefore match the current music state. A selected version and a failed newer generation remain separate facts.

## Pagination and document windows

- Collections use database keyset paging. Default limit is 20, maximum 100. `list_shot_staleness` uses default 5, maximum 20 because dependency comparison is more expensive; it shares sequence reference loads across the page.
- New collections are ordered by stable database ID, oldest ID first. Frame `orderIndex`, scene order and shot `shotNumber` describe creative/playback order. Existing scene/shot tools retain their hierarchical ordering.
- Pass `nextCursor` with the same sequence, collection, parent and filters. Cursors from another collection/filter are rejected. Changing page size is allowed.
- Usage queries page **candidates examined**, then apply the same matchers as the editor. `examined` reports the work scanned. An empty page with a non-null cursor does not mean there are no further matches. Continue until `nextCursor` is null.
- Version lists select compact metadata without loading prompt text or render manifests. Full content is fetched by explicit version ID.
- Large scripts, version records, audio clip sets and activity payloads use `document.text`, `offset`, `totalLength`, `nextOffset`, `revision` and `format`. Default window length is 8,000 UTF-16 code units, maximum 16,000.
- Continue with `offset: nextOffset` and the returned `revision`. A changed document rejects the continuation. For `format: json`, concatenate all windows before parsing JSON. UTF-16 windows can split a surrogate pair; joining the returned strings restores the original text.
- Both structured results and JSON text fallback are returned. Their combined envelope is capped at 256 KiB. Oversized collections return an actionable error to reduce the page size; data is not silently truncated.
- Version, reference and media outputs have explicit schema allowlists. Database storage paths and pending input claims are excluded. Media URLs are made absolute using the same storage helper as the public API.

## Traversal examples

Read a character and discover every affected shot:

1. `list_characters({ sequenceId })` → a database character `id`.
2. `get_character({ sequenceId, characterId: id })` → selected sheet and voice state.
3. `list_versions({ sequenceId, kind: "character_sheet", entityId: id })` → history IDs.
4. `get_version({ sequenceId, kind: "character_sheet", entityId: id, versionId })` → full version document.
5. `list_entity_usages({ sequenceId, kind: "character", entityId: id })` → shot/scene IDs, continuing every page.
6. `get_shot({ sequenceId, shotId })` and `get_shot_staleness({ sequenceId, shotId })` → current outputs and freshness.

Inspect how a video was produced:

1. `get_shot` → `renderSegmentId` and selected video version ID.
2. `get_render_segment` → current membership, with pagination.
3. `get_version({ sequenceId, kind: "video", entityId: renderSegmentId, versionId })` → captured render manifest.
4. Follow manifest frame/motion-prompt IDs through the relevant `get_version` calls.
5. `get_render_segment_staleness` → comparison with current inputs and voice bindings.

## Authorization and read-only behavior

The MCP server is a request composition boundary. Its narrow `no-scoped-factory` exception permits `createScopedDb(auth.teamId, auth.user.id)` after checking the OAuth read scope. It has no raw-DB or SQL exception. Discovery and `whoami` do not create a scoped DB.

Queries live in product `server/db/` modules. Every new repository entry point authorizes the sequence, then validates the owning child chain. A frame must belong to an active shot in that sequence; a segment must belong to an active scene. History lookups also constrain the version's actual parent, including location sheet parent type. Wrong-team, wrong-sequence, wrong-parent and deleted-child reads return not-found.

The new read methods use `get`/`list` names so the existing `WorkflowScopedDb` type removes them from workflow write surfaces. MCP reads never repair anchor frames, alter selections, claim generation, reserve credits, start exports or reconcile jobs.

Staleness uses existing domain semantics. A missing anchor is reported as untracked rather than created. Voice-only characters report sheet freshness as not applicable. Music track-level freshness is explicitly untracked; the current product derives music regeneration from prompt changes. These are inspection tools, not a second generation planner.

## Remaining MCP work

This PR covers active production inspection and its retained histories. It does not expose sequence/cast/library mutations or paid work. Archived/deleted entity recovery, standalone talent/location/style-library browsing and studio/model/billing catalogs remain separate capability work; linked library IDs are provided here.

The intended next boundaries are:

1. **This PR:** production reads, shared contracts, docs and tests.
2. **Editing:** sequence creation/settings, scene/shot structure, cast/location/element editing, prompts, media uploads and version selection through shared domain operations.
3. **Execution:** generation plans/approval, replay-safe execution, operation polling, cancellation, retries and export rendering.

[#1462](https://github.com/openstory-so/openstory/issues/1462) can assemble bible/resources from shared read projections without waiting for mutations. [#1463](https://github.com/openstory-so/openstory/issues/1463) covers incremental client compatibility and workflow documentation. Local tests exercise the official server handler with real migrated SQLite; a deployed client compatibility matrix is separate release evidence and is not claimed by those tests.
