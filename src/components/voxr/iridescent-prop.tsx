"use client";

/**
 * Voxr-style iridescent 3D prop.
 *
 * Chrome-iridescent icosahedron, slow tumble + float, lit by colored
 * point lights so it picks up purple/cyan highlights without needing
 * an HDR environment map (which drei's preset would fetch from a CDN —
 * a network call we don't want on the auth/login critical path).
 *
 * Three.js + R3F + drei adds ~150KB gzipped. Dynamically import this
 * from a server boundary so it stays off the initial bundle.
 */
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import type { Mesh } from "three";

interface IridescentPropProps {
  /** Hex color used for the dominant rim light + halo. */
  accent?: string;
  /** Pixel ratio cap. Default 1.5 — retina without thrashing GPU. */
  dpr?: number;
  className?: string;
}

function ChromeIcosahedron({ accent }: { accent: string }) {
  const meshRef = useRef<Mesh>(null);

  // Slow tumble on coprime axes so the silhouette never repeats predictably.
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += delta * 0.18;
    meshRef.current.rotation.y += delta * 0.24;
  });

  return (
    <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.6}>
      <mesh ref={meshRef} scale={1.35}>
        {/* detail=0 → 20 faces, sharp d20 silhouette. Higher detail rounds
            toward a sphere and kills the chrome facet read. */}
        <icosahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial
          color="#cfcfd6"           /* near-silver base                       */
          metalness={1}
          roughness={0.18}
          iridescence={1}
          iridescenceIOR={1.4}
          iridescenceThicknessRange={[120, 720]}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1}
          emissive={accent}
          emissiveIntensity={0.05}
        />
      </mesh>
    </Float>
  );
}

export function IridescentProp({
  accent = "#a855f7",
  dpr = 1.5,
  className,
}: IridescentPropProps) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        dpr={dpr}
        camera={{ position: [0, 0, 4], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        {/* Lighting rig — colored points so the chrome picks up rainbow
            highlights without an HDR env map. Positions chosen so at any
            rotation at least one rim is purple-tinted. */}
        <ambientLight intensity={0.35} />
        <pointLight position={[3, 3, 2]} intensity={2.2} color="#ffffff" />
        <pointLight position={[-3, 1, 1]} intensity={2.0} color={accent} />
        <pointLight position={[0, -3, 2]} intensity={1.5} color="#5ed1ff" />
        <pointLight position={[2, -1, -2]} intensity={1.2} color="#ff6ec7" />
        <directionalLight position={[0, 5, 0]} intensity={0.6} />

        <ChromeIcosahedron accent={accent} />
      </Canvas>
    </div>
  );
}

export default IridescentProp;
