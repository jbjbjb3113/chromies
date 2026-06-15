import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ComingSoon from "./pages/ComingSoon.jsx";
import PasswordGate from "./components/PasswordGate.jsx";
import LandingWithSplash from "./pages/LandingWithSplash.jsx";
import Lab from "./pages/Lab.jsx";
import Mint from "./pages/Mint.jsx";
import Market from "./pages/Market.jsx";
import MyChromies from "./pages/MyChromies.jsx";
import Burn from "./pages/Burn.jsx";
import Inscribe from "./pages/Inscribe.jsx";
import FAQ from "./pages/FAQ.jsx";
import Canvas from "./pages/Canvas.jsx";
import PixelChroma from "./PixelChroma.jsx";

function Gated({ children }) {
  return <PasswordGate>{children}</PasswordGate>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ComingSoon />} />
      <Route path="/coming-soon" element={<Navigate to="/" replace />} />
      <Route
        path="/landing"
        element={
          <Gated>
            <LandingWithSplash />
          </Gated>
        }
      />
      <Route
        path="/mint"
        element={
          <Gated>
            <Mint />
          </Gated>
        }
      />
      <Route
        path="/market"
        element={
          <Gated>
            <Market />
          </Gated>
        }
      />
      <Route
        path="/my-chromies"
        element={
          <Gated>
            <MyChromies />
          </Gated>
        }
      />
      <Route
        path="/burn"
        element={
          <Gated>
            <Burn />
          </Gated>
        }
      />
      <Route
        path="/inscribe"
        element={
          <Gated>
            <Inscribe />
          </Gated>
        }
      />
      <Route
        path="/faq"
        element={
          <Gated>
            <FAQ />
          </Gated>
        }
      />
      <Route path="/lab" element={<Lab />} />
      <Route path="/canvas" element={<Canvas />} />
      <Route path="/pixel-chroma" element={<PixelChroma />} />
    </Routes>
  );
}
