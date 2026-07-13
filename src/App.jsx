import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LandingWithSplash from "./pages/LandingWithSplash.jsx";
import MintingSoon from "./pages/MintingSoon.jsx";
import Lab from "./pages/Lab.jsx";
import Mint from "./pages/Mint.jsx";
import Market from "./pages/Market.jsx";
import MyChromies from "./pages/MyChromies.jsx";
import Burn from "./pages/Burn.jsx";
import Inscribe from "./pages/Inscribe.jsx";
import FAQ from "./pages/FAQ.jsx";
import Canvas from "./pages/Canvas.jsx";
import LaunchEdition from "./pages/LaunchEdition.jsx";
import Provenance from "./pages/Provenance.jsx";
import PixelChroma from "./PixelChroma.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MintingSoon />} />
      <Route path="/landing" element={<LandingWithSplash />} />
      <Route path="/coming-soon" element={<Navigate to="/" replace />} />
      <Route path="/mint" element={<Mint />} />
      <Route path="/market" element={<Market />} />
      <Route path="/my-chromies" element={<MyChromies />} />
      <Route path="/burn" element={<Burn />} />
      <Route path="/inscribe" element={<Inscribe />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/lab" element={<Lab />} />
      <Route path="/canvas" element={<Canvas />} />
      <Route path="/launch-edition" element={<LaunchEdition />} />
      <Route path="/provenance" element={<Provenance />} />
      <Route path="/pixel-chroma" element={<PixelChroma />} />
    </Routes>
  );
}
