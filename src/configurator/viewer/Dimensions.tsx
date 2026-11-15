import { useEffect, useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PlacedVariant } from './layout.ts';

/** World positions + texts of all visible labels, so snapshots can draw them into the image. */
export const labelRegistry = new Map<string, { position: THREE.Vector3; text: string; kind: 'dim' | 'tag' }>();

type V3 = [number, number, number];

function DimLine({ id, from, to, tick, text, color }: { id: string; from: V3; to: V3; tick: V3; text: string; color: string }) {
  const mid: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const pts = useMemo(() => {
    const t = (p: V3, s: number): V3 => [p[0] + tick[0] * s, p[1] + tick[1] * s, p[2] + tick[2] * s];
    // main line + end ticks + short extension of the ticks
    return [from, to, t(from, -1), t(from, 1), t(to, -1), t(to, 1)];
  }, [from, to, tick]);
  useEffect(() => {
    labelRegistry.set(id, { position: new THREE.Vector3(...mid), text, kind: 'dim' });
    return () => {
      labelRegistry.delete(id);
    };
  });
  return (
    <group>
      <Line points={pts} segments color={color} lineWidth={1.5} transparent opacity={0.9} depthTest={false} renderOrder={10} />
      <Html position={mid} center zIndexRange={[20, 10]} className="dim-label-wrap" aria-hidden>
        <span className="dim-label">{text}</span>
      </Html>
    </group>
  );
}

/** Toggleable dimension lines (length, depth, height) in centimeters around one variant. */
export function Dimensions({ variant, color = '#3a2a1e' }: { variant: PlacedVariant; color?: string }) {
  const { config, x, z, size } = variant;
  const [L, H, W] = size;
  // Lines sit outside the piece like on a workshop drawing: length in front of the top edge,
  // depth beside the right end, height at the front right corner.
  const off = 0.1;
  const tick = 0.03;
  const front = z + W / 2;
  const right = x + L / 2;
  const key = variant.label ?? 'main';
  const lengthLine = { from: [x - L / 2, H, front + off] as V3, to: [right, H, front + off] as V3, tick: [0, 0, tick] as V3 };
  const depthLine = { from: [right + off, H, z - W / 2] as V3, to: [right + off, H, front] as V3, tick: [tick, 0, 0] as V3 };
  const heightLine = { from: [right + off, 0, front + off] as V3, to: [right + off, H, front + off] as V3, tick: [tick, 0, tick] as V3 };
  return (
    <group name="dimensions">
      <DimLine id={`${key}-l`} {...lengthLine} text={`${config.lengthCm} cm`} color={color} />
      <DimLine id={`${key}-w`} {...depthLine} text={`${config.widthCm} cm`} color={color} />
      <DimLine id={`${key}-h`} {...heightLine} text={`${config.heightCm} cm`} color={color} />
    </group>
  );
}

/** "A" / "B" tags above the variants in compare mode. */
export function VariantTag({ variant }: { variant: PlacedVariant }) {
  const pos: V3 = [variant.x, variant.size[1] + 0.22, variant.z];
  const id = `tag-${variant.label}`;
  useEffect(() => {
    labelRegistry.set(id, { position: new THREE.Vector3(...pos), text: `Variant ${variant.label}`, kind: 'tag' });
    return () => {
      labelRegistry.delete(id);
    };
  });
  return (
    <Html position={pos} center zIndexRange={[20, 10]} aria-hidden>
      <span className="variant-tag">{variant.label}</span>
    </Html>
  );
}
