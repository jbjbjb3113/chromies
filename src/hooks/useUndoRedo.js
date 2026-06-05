import { useCallback, useRef, useState } from "react";
import { cloneIndices } from "../lib/pixel-canvas.js";

const MAX_HISTORY = 80;

export function useUndoRedo(initial) {
  const [indices, setIndicesState] = useState(() => cloneIndices(initial));
  const [historyTick, setHistoryTick] = useState(0);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const skipRef = useRef(false);

  const bump = useCallback(() => setHistoryTick((n) => n + 1), []);

  const setIndices = useCallback(
    (next, { record = true } = {}) => {
      setIndicesState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (record && !skipRef.current) {
          pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), cloneIndices(prev)];
          futureRef.current = [];
          bump();
        }
        skipRef.current = false;
        return cloneIndices(value);
      });
    },
    [bump],
  );

  const resetHistory = useCallback(
    (value) => {
      pastRef.current = [];
      futureRef.current = [];
      skipRef.current = true;
      setIndicesState(cloneIndices(value));
      bump();
    },
    [bump],
  );

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    setIndicesState((current) => {
      const prev = past[past.length - 1];
      pastRef.current = past.slice(0, -1);
      futureRef.current = [cloneIndices(current), ...futureRef.current];
      skipRef.current = true;
      bump();
      return cloneIndices(prev);
    });
  }, [bump]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    setIndicesState((current) => {
      const next = future[0];
      futureRef.current = future.slice(1);
      pastRef.current = [...pastRef.current, cloneIndices(current)];
      skipRef.current = true;
      bump();
      return cloneIndices(next);
    });
  }, [bump]);

  return {
    indices,
    setIndices,
    resetHistory,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    historyTick,
  };
}
