import React from "react";
import { Routes, Route } from "react-router-dom";
import ComingSoon from "./pages/ComingSoon.jsx";
import PasswordGate from "./components/PasswordGate.jsx";
import Landing from "./pages/Landing.jsx";
import Lab from "./pages/Lab.jsx";
import Mint from "./pages/Mint.jsx";
import Canvas from "./pages/Canvas.jsx";
import PixelChroma from "./PixelChroma.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ComingSoon />} />
      <Route
        path="/mint"
        element={
          <PasswordGate>
            <Mint />
          </PasswordGate>
        }
      />
      <Route
        path="/landing"
        element={
          <PasswordGate>
            <Landing />
          </PasswordGate>
        }
      />
      <Route path="/lab" element={<Lab />} />
      <Route path="/canvas" element={<Canvas />} />
      <Route path="/pixel-chroma" element={<PixelChroma />} />
    </Routes>
  );
}
