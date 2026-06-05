import React from "react";
import { Routes, Route } from "react-router-dom";
import LandingWithSplash from "./pages/LandingWithSplash.jsx";
import Lab from "./pages/Lab.jsx";
import Mint from "./pages/Mint.jsx";
import Canvas from "./pages/Canvas.jsx";
import PixelChroma from "./PixelChroma.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingWithSplash />} />
      <Route path="/mint" element={<Mint />} />
      <Route path="/lab" element={<Lab />} />
      <Route path="/canvas" element={<Canvas />} />
      <Route path="/pixel-chroma" element={<PixelChroma />} />
    </Routes>
  );
}
