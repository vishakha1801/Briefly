"use client";

import { StaticMeshGradient } from "@paper-design/shaders-react";

export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <StaticMeshGradient
        width="100%"
        height="100%"
        colors={["#F2F4FF", "#DDE3FF", "#AEB7FF", "#3B49EA"]}
        positions={38}
        waveX={0.44}
        waveXShift={0.59}
        waveY={0.78}
        waveYShift={0.09}
        mixing={0.18}
        grainMixer={0.16}
        grainOverlay={0.07}
        scale={1}
        fit="cover"
      />
      {/* Lighten and soften the gradient so cards and text remain readable */}
      <div className="absolute inset-0 bg-white/45 backdrop-blur-[1px]" />
    </div>
  );
}
