import { useCallback, useEffect, useRef, useState } from "react";
import { cloneIndices, indicesEqual } from "../lib/pixel-canvas.js";

const MAX_HISTORY = 80;

export function useUndoRedo(initial) {
  const [indices, setIndicesState] = useState(() => cloneIndices(initial));
  const [historyFlags, setHistoryFlags] = useState({
    canUndo: false,
    canRedo: false,
    pastLength: 0,
  });
  const [historyTick, setHistoryTick] = useState(0);
  const indicesRef = useRef(indices);
  const pastRef = useRef([]);
  const futureRef = useRef([]);

  useEffect(() => {
    indicesRef.current = indices;
  }, [indices]);

  const bump = useCallback(() => {
    setHistoryFlags({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      pastLength: pastRef.current.length,
    });
    setHistoryTick((n) => n + 1);
  }, []);

  const setIndices = useCallback(
    (next, { record = true } = {}) => {
      const prev = indicesRef.current;
      const value = typeof next === "function" ? next(prev) : next;
      const nextIndices = cloneIndices(value);

      if (indicesEqual(prev, nextIndices)) {
        return;
      }

      if (record) {
        pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), cloneIndices(prev)];
        futureRef.current = [];
      }

      indicesRef.current = nextIndices;
      setIndicesState(nextIndices);
      bump();
    },
    [bump],
  );

  const resetHistory = useCallback(
    (value) => {
      const nextIndices = cloneIndices(value);
      pastRef.current = [];
      futureRef.current = [];
      indicesRef.current = nextIndices;
      setIndicesState(nextIndices);
      bump();
    },
    [bump],
  );

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;

    const current = indicesRef.current;
    const prev = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [cloneIndices(current), ...futureRef.current];

    const restored = cloneIndices(prev);
    indicesRef.current = restored;
    setIndicesState(restored);
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;

    const current = indicesRef.current;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, cloneIndices(current)];

    const restored = cloneIndices(next);
    indicesRef.current = restored;
    setIndicesState(restored);
    bump();
  }, [bump]);

  return {
    indices,
    setIndices,
    resetHistory,
    undo,
    redo,
    canUndo: historyFlags.canUndo,
    canRedo: historyFlags.canRedo,
    historyTick,
  };
}
