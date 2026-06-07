import React, { useCallback, useEffect, useRef, useState } from "react";
import SplashScreen from "../components/SplashScreen.jsx";
import Landing from "./Landing.jsx";

const SPLASH_KEY = "chromies-splash-seen";
const SPLASH_HOLD_MS = 6500;
const FADE_MS = 250;

function hasSeenSplash() {
  try {
    return sessionStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

export default function LandingWithSplash() {
  const seenOnLoad = hasSeenSplash();

  const [splashMounted, setSplashMounted] = useState(!seenOnLoad);
  const [splashVisible, setSplashVisible] = useState(!seenOnLoad);
  const [landingRevealed, setLandingRevealed] = useState(seenOnLoad);
  const dismissingRef = useRef(false);
  const splashMountedRef = useRef(splashMounted);
  splashMountedRef.current = splashMounted;

  const dismiss = useCallback(() => {
    if (dismissingRef.current || !splashMountedRef.current) return;
    dismissingRef.current = true;
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    setSplashVisible(false);
    window.setTimeout(() => {
      setSplashMounted(false);
      setLandingRevealed(true);
    }, FADE_MS);
  }, []);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!splashMounted) return;
    const t = window.setTimeout(() => dismissRef.current(), SPLASH_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [splashMounted]);

  useEffect(() => {
    if (!splashMounted) return;
    const onKey = () => dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [splashMounted, dismiss]);

  return (
    <>
      <div
        className={`transition-all duration-[250ms] ease-out ${
          landingRevealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <Landing />
      </div>
      {splashMounted && <SplashScreen visible={splashVisible} onDismiss={dismiss} />}
    </>
  );
}
