"use client";

/**
 * Voxr-style iridescent 3D prop.
 *
 * Chrome-iridescent icosahedron, slow tumble + float, lit by a *procedural*
 * environment built from drei `<Lightformer>` rects so the metal has
 * something purple/cyan/magenta to reflect — no CDN HDR fetch on the
 * critical path, no static cubemap binary in the bundle.
 *
 * Why this matters: `meshPhysicalMaterial` with `metalness=1` has a near-
 * zero diffuse term — almost the entire surface read comes from
 * environment reflections. With no env map the chrome collapses to black.
 * `<Environment>` rendering a tiny 128² cubemap from JSX gives the metal
 * its rainbow rim without paying a network request.
 *
 * Three.js + R3F + drei adds ~150KB gzipped. Dynamically import this
 * from a server boundary so it stays off the initial bundle.
 */
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, Lightformer } from "@react-three/drei";
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
          color="#e8e8ee"           /* near-silver base                       */
          metalness={1}
          roughness={0.16}
          iridescence={1}
          iridescenceIOR={1.45}
          iridescenceThicknessRange={[120, 720]}
          clearcoat={1}
          clearcoatRoughness={0.06}
          envMapIntensity={1.4}
          emissive={accent}
          emissiveIntensity={0.06}
        />
      </mesh>
    </Float>
  );
}

/**
 * Procedural environment — five colored Lightformer rects placed around
 * the mesh. Each contributes both as a light source AND as something the
 * chrome reflects, so the icosahedron picks up violet on one face,
 * magenta on the next, cyan on the bottom rim. Resolution 128 is plenty
 * for a single hero prop and renders in <2ms on integrated GPUs.
 */
function ProceduralEnv({ accent }: { accent: string }) {
  // `frames={Infinity}` re-renders the env cubemap every frame. For a
  // single hero prop at 128² this is a few ms; the benefit is that
  // Lightformer mount/unmount and accent prop changes get picked up
  // without a stale single-shot render.
  return (
    <Environment resolution={256} frames={Infinity} background={false}>
      {/* Key — bright warm white from upper-front, gives the d20 its
          dominant highlight band. Intensity is high (12) because the
          panel is small relative to the cubemap and we want it to read
          as a strong specular pop, not ambient wash. */}
      <Lightformer
        intensity={12}
        color="#ffffff"
        position={[0, 4, 4]}
        rotation={[-Math.PI / 4, 0, 0]}
        scale={[6, 4, 1]}
      />
      {/* Accent rim — large violet panel on the left. */}
      <Lightformer
        intensity={14}
        color={accent}
        position={[-5, 1, 2]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[10, 8, 1]}
      />
      {/* Cyan kick from below — gives under-facets that "screen glow"
          cool tone seen in Voxr renders. */}
      <Lightformer
        intensity={10}
        color="#5ed1ff"
        position={[2, -3, 2]}
        rotation={[Math.PI / 3, 0, 0]}
        scale={[8, 6, 1]}
      />
      {/* Magenta fill on the right — pairs against the violet to create
          the iridescent split the iridescence shader samples across. */}
      <Lightformer
        intensity={9}
        color="#ff6ec7"
        position={[5, 0, -1]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[8, 8, 1]}
      />
      {/* Backlight — silhouette anti-flatten on the dark background. */}
      <Lightformer
        intensity={7}
        color="#c9b6ff"
        position={[0, 1, -5]}
        rotation={[0, Math.PI, 0]}
        scale={[10, 8, 1]}
      />
      {/* Floor bounce — soft warm fill so bottom facets aren't pitch
          black when the d20 tumbles to show the underside. */}
      <Lightformer
        intensity={5}
        color="#fff4e0"
        position={[0, -5, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[8, 8, 1]}
      />
    </Environment>
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
        gl={{
          antialias: true,
          alpha: true,
          // preserveDrawingBuffer lets external tools (browser screenshot,
          // OS screen capture, html-to-image) read the WebGL canvas. Cost
          // is a small extra copy per frame — negligible for one prop.
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
      >
        {/* Soft ambient so unreflected facets don't go fully black on
            slow GPUs that throttle the env render. */}
        <ambientLight intensity={0.25} />

        <ProceduralEnv accent={accent} />
        <ChromeIcosahedron accent={accent} />
      </Canvas>
    </div>
  );
}

export default IridescentProp;
