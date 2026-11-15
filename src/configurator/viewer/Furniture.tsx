import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Config, Part } from '../../lib/types.ts';
import type { Model } from '../../lib/model.ts';
import { SPECIES } from '../../data/species.ts';
import { partGeometry } from './geometry.ts';
import { loadSpeciesTextures, woodMaterials, type Quality } from './materials.ts';

/** Placeholder materials (flat species color) while the textures are being generated. */
const placeholderCache = new Map<string, THREE.Material[]>();
function placeholder(config: Config): THREE.Material[] {
  const key = config.species;
  let m = placeholderCache.get(key);
  if (!m) {
    const [r, g, b] = SPECIES[config.species].look.early;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${r},${g},${b})`), roughness: 0.75 });
    m = [mat, mat];
    placeholderCache.set(key, m);
  }
  return m;
}

export function useWoodMaterials(config: Config, quality: Quality, onLoading?: (loading: boolean) => void) {
  const invalidate = useThree((s) => s.invalidate);
  const [mats, setMats] = useState<THREE.Material[] | null>(null);
  useEffect(() => {
    let alive = true;
    onLoading?.(true);
    loadSpeciesTextures(config.species, quality).then((tex) => {
      if (!alive) return;
      setMats(woodMaterials(tex, config.species, config.finish, quality));
      onLoading?.(false);
      invalidate();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.species, config.finish, quality]);
  const ready = mats && mats[0]?.name.startsWith(`${config.species}-${config.finish}`);
  return ready ? mats : placeholder(config);
}

function PartMesh({ part, materials }: { part: Part; materials: THREE.Material[] }) {
  // Rebuild the geometry only when the part's shape changes (not on wood/finish changes)
  const shapeKey = `${part.id}|${part.size.join(',')}|${part.grain}|${part.edge ?? ''}|${part.taper ? part.taper.bottom.join(',') + part.taper.flush.join(',') : ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pg = useMemo(() => partGeometry(part), [shapeKey]);
  useEffect(() => () => pg.geometry.dispose(), [pg]);
  return (
    <mesh
      name={part.id}
      geometry={pg.geometry}
      material={materials}
      position={[part.position[0] / 1000, part.position[1] / 1000, part.position[2] / 1000]}
      rotation={pg.rotation}
      castShadow
      receiveShadow
    />
  );
}

interface Props {
  config: Config;
  model: Model;
  quality: Quality;
  position: [number, number, number];
  onLoading?: (loading: boolean) => void;
  name?: string;
}

/** Renders one configuration from its parametric parts. */
export function Furniture({ config, model, quality, position, onLoading, name }: Props) {
  const materials = useWoodMaterials(config, quality, onLoading);
  const visible = useMemo(() => model.parts.filter((p) => !p.hidden), [model]);
  return (
    <group position={position} name={name ?? 'furniture'} userData={{ furniture: true }}>
      {visible.map((p) => (
        <PartMesh key={p.id} part={p} materials={materials} />
      ))}
    </group>
  );
}
