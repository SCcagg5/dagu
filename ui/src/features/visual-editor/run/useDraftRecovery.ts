// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredDraft } from '../contracts';
import { readDraft, removeDraft, writeDraft } from './draftStorage';

const STORE_DELAY_MS = 1000;

interface DraftRecoveryInput {
  storageKey: string;
  serverText?: string;
  currentText?: string;
  isDirty: boolean;
  /** Tells if two texts are the same content; default strict equality. */
  isSame?(a: string, b: string): boolean;
}

const strictlyEqual = (a: string, b: string) => a === b;

// The stored draft is read at mount, before any write of this mount can
// replace it. The offer is decided once serverText is known.
interface RecoveryState {
  key: string;
  stored: StoredDraft | null;
  offered: StoredDraft | null;
  decided: boolean;
}

function initialState(key: string): RecoveryState {
  return { key, stored: readDraft(key), offered: null, decided: false };
}

interface DraftRecovery {
  draft: StoredDraft | null;
  discard(): void;
}

/**
 * Keeps unsaved editor text in browser storage and offers it back after a
 * reload. The stored draft has no `baseSha256`: the hook gets no hash.
 */
export function useDraftRecovery({
  storageKey,
  serverText,
  currentText,
  isDirty,
  isSame = strictlyEqual,
}: DraftRecoveryInput): DraftRecovery {
  const [state, setState] = useState(() => initialState(storageKey));
  let current = state;
  if (current.key !== storageKey) {
    current = initialState(storageKey);
    setState(current);
  }
  if (!current.decided && serverText !== undefined) {
    const { stored } = current;
    current = {
      ...current,
      offered:
        stored !== null && !isSame(stored.text, serverText) ? stored : null,
      decided: true,
    };
    setState(current);
  }

  const discard = useCallback(() => {
    removeDraft(storageKey);
    setState((prev) => ({ ...prev, stored: null, offered: null }));
  }, [storageKey]);

  // The key for which this mount has seen dirty text. A clean mount must keep
  // the stored draft until the user can recover it.
  const dirtyKey = useRef<string | null>(null);
  useEffect(() => {
    if (isDirty) {
      dirtyKey.current = storageKey;
    } else if (
      dirtyKey.current === storageKey &&
      currentText !== undefined &&
      serverText !== undefined &&
      isSame(currentText, serverText)
    ) {
      removeDraft(storageKey);
      dirtyKey.current = null;
    }
  }, [storageKey, serverText, currentText, isDirty, isSame]);

  // Text not yet written, for the flush on page hide and on unmount.
  const pending = useRef<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (!isDirty || currentText === undefined) {
      pending.current = null;
      return;
    }
    pending.current = { key: storageKey, text: currentText };
    const timer = setTimeout(() => {
      pending.current = null;
      writeDraft(storageKey, { text: currentText, savedAt: Date.now() });
    }, STORE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [storageKey, currentText, isDirty]);

  useEffect(() => {
    const flush = () => {
      const next = pending.current;
      if (next === null) return;
      pending.current = null;
      writeDraft(next.key, { text: next.text, savedAt: Date.now() });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return { draft: current.offered, discard };
}
