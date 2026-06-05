import React from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Lab from "./pages/Lab.jsx";
import Mint from "./pages/Mint.jsx";
import PixelChroma from "./PixelChroma.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/mint" element={<Mint />} />
      <Route path="/lab" element={<Lab />} />
      <Route path="/pixel-chroma" element={<PixelChroma />} />
    </Routes>
  );
}
