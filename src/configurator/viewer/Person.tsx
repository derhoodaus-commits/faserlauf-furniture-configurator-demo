import { useMemo } from 'react';
import * as THREE from 'three';
import { PERSON_HEIGHT_MM } from '../../data/room.ts';

/**
 * A neutral 175 cm scale figure built from capsules: no face, no gender, just proportions
 * (head ≈ 1/7.5 of the height, as in drawing guides).
 */
export function Person({ x, z, visible }: { x: number; z: number; visible: boolean }) {
  const H = PERSON_HEIGHT_MM / 1000;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a9a39a', roughness: 0.85 }), []);
  const u = H / 7.5; // head height unit
  const legLen = u * 3.6;
  const torsoLen = u * 2.6;
  const shoulderY = legLen + torsoLen;
  return (
    <group position={[x, 0, z]} visible={visible} name="person">
      {/* legs */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * u * 0.32, legLen / 2 + 0.01, 0]} material={mat} castShadow>
          <capsuleGeometry args={[u * 0.24, legLen - u * 0.48, 4, 10]} />
        </mesh>
      ))}
      {/* torso */}
      <mesh position={[0, legLen + torsoLen / 2 - u * 0.1, 0]} material={mat} castShadow scale={[1, 1, 0.62]}>
        <capsuleGeometry args={[u * 0.62, torsoLen - u * 1.0, 4, 14]} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * u * 0.86, shoulderY - u * 1.45, 0]} rotation={[0, 0, s * 0.06]} material={mat} castShadow>
          <capsuleGeometry args={[u * 0.17, u * 2.5, 4, 10]} />
        </mesh>
      ))}
      {/* neck + head */}
      <mesh position={[0, shoulderY + u * 0.1, 0]} material={mat} castShadow>
        <cylinderGeometry args={[u * 0.2, u * 0.22, u * 0.4, 12]} />
      </mesh>
      <mesh position={[0, H - u * 0.5, 0]} material={mat} castShadow scale={[0.85, 1, 0.95]}>
        <sphereGeometry args={[u * 0.5, 20, 16]} />
      </mesh>
    </group>
  );
}
