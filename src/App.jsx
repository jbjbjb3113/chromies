import React from "react";
import { Routes, Route } from "react-router-dom";
import ComingSoon from "./pages/ComingSoon.jsx";
import PasswordGate from "./components/PasswordGate.jsx";
import Landing from "./pages/Landing.jsx";
import Lab from "./pages/Lab.jsx";
import Mint from "./pages/Mint.jsx";
import Market from "./pages/Market.jsx";
import MyChromies from "./pages/MyChromies.jsx";
import Burn from "./pages/Burn.jsx";
import Reveal from "./pages/Reveal.jsx";
import Inscribe from "./pages/Inscribe.jsx";
import FAQ from "./pages/FAQ.jsx";
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
        path="/market"
        element={
          <PasswordGate>
            <Market />
          </PasswordGate>
        }
      />
      <Route
        path="/my-chromies"
        element={
          <PasswordGate>
            <MyChromies />
          </PasswordGate>
        }
      />
      <Route
        path="/burn"
        element={
          <PasswordGate>
            <Burn />
          </PasswordGate>
        }
      />
      <Route
        path="/reveal"
        element={
          <PasswordGate>
            <Reveal />
          </PasswordGate>
        }
      />
      <Route
        path="/inscribe"
        element={
          <PasswordGate>
            <Inscribe />
          </PasswordGate>
        }
      />
      <Route
        path="/faq"
        element={
          <PasswordGate>
            <FAQ />
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
