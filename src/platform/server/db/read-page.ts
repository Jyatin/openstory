import {
  scopedPageCursor,
  scopedPage,
  type ScopedPageInput,
} from './scoped-read-page';

export type ReadPageInput = ScopedPageInput & { sequenceId: string };

/** Sequence collections use the same cursor contract as team libraries. */
export function readPageCursor(input: ReadPageInput, ...scope: string[]) {
  return scopedPageCursor(input, [input.sequenceId, ...scope]);
}

export function readPage<T extends { id: string }>(
  rows: T[],
  input: ReadPageInput,
  ...scope: string[]
) {
  return scopedPage(rows, input, [input.sequenceId, ...scope]);
}
