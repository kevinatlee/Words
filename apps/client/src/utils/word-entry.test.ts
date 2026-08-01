import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isExpectedSubmissionRejection,
  loadWordEntryMode,
  saveWordEntryMode,
  updateWordPath,
} from './word-entry';

const tiles = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'QU',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
];

describe('word entry utilities', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to Trace when no preference was stored', () => {
    expect(loadWordEntryMode()).toBe('trace');
  });

  it('defaults to Trace when a stored preference is invalid', () => {
    window.localStorage.setItem('words:word-entry-mode', 'keyboard');

    expect(loadWordEntryMode()).toBe('trace');
  });

  it('defaults to Trace when local storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(loadWordEntryMode()).toBe('trace');
  });

  it('restores an explicitly saved Tap preference', () => {
    saveWordEntryMode('touch');

    expect(loadWordEntryMode()).toBe('touch');
  });

  it('restores an explicitly saved Trace preference', () => {
    saveWordEntryMode('trace');

    expect(loadWordEntryMode()).toBe('trace');
  });

  it('removes the final selected tile and truncates back to earlier tiles', () => {
    expect(updateWordPath([0, 1, 2], 2, tiles, 4, 64).path).toEqual([0, 1]);
    expect(updateWordPath([0, 1, 2, 3], 1, tiles, 4, 64).path).toEqual([0, 1]);
    expect(updateWordPath([0], 0, tiles, 4, 64).path).toEqual([]);
  });

  it('builds only adjacent, unused paths and supports QU', () => {
    expect(updateWordPath([0], 6, tiles, 4, 64).path).toEqual([0]);
    expect(updateWordPath([0, 1], 0, tiles, 4, 64).path).toEqual([0]);
    expect(updateWordPath([6], 7, tiles, 4, 64).path).toEqual([6, 7]);
  });

  it('retains a path and reports the existing word-length limit', () => {
    const result = updateWordPath([0, 1], 2, tiles, 4, 2);

    expect(result).toEqual({ path: [0, 1], exceededMaximumLength: true });
  });

  it('treats declared gameplay rejections as expected but retains internal failures', () => {
    expect(isExpectedSubmissionRejection('WORD_NOT_IN_DICTIONARY')).toBe(true);
    expect(isExpectedSubmissionRejection('ALREADY_SUBMITTED')).toBe(true);
    expect(isExpectedSubmissionRejection('INTERNAL_ERROR')).toBe(false);
  });
});
