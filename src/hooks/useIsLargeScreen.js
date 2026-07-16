import { useEffect, useState } from "react";

const LARGE_SCREEN_QUERY = "(min-width: 1024px)";

/** Matches Tailwind `lg` — desktop listing layout at 1024px and up. */
export function useIsLargeScreen() {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(LARGE_SCREEN_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(LARGE_SCREEN_QUERY);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return matches;
}
