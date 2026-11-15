import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WALLS } from '../../data/room.ts';
import type { FloorId, WallId } from '../../lib/types.ts';
import { FLOOR_TILE_MM } from '../../lib/wood/generator.ts';
import { loadFloorTextures, type Quality } from './materials.ts';

const ROOM_W = 6.2;
const ROOM_D = 4.8;
const ROOM_H = 2.6;
const SKIRT_H = 0.08;
const SKIRT_T = 0.016;

interface Props {
  wall: WallId;
  floor: FloorId;
  backWallZ: number;
  leftWallX: number;
  quality: Quality;
  visible: boolean;
}

/** A simple room: floor, back wall, left wall, skirting boards. */
export function Room({ wall, floor, backWallZ, leftWallX, quality, visible }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const [floorMat] = useState(
    () => new THREE.MeshStandardMaterial({ color: '#b8a58c', roughness: 0.7 }),
  );
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: WALLS[wall].hex, roughness: 0.95 }), []);
  const skirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.6 }), []);

  useEffect(() => {
    wallMat.color.set(WALLS[wall].hex);
    invalidate();
  }, [wall, wallMat, invalidate]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    loadFloorTextures(floor, quality).then((t) => {
      if (!alive) return;
      const repeat = (ROOM_W * 1000) / FLOOR_TILE_MM;
      for (const tex of [t.map, t.normal, t.rough]) {
        tex.repeat.set(repeat, (ROOM_D * 1000) / FLOOR_TILE_MM);
      }
      floorMat.map = t.map;
      floorMat.normalMap = t.normal;
      floorMat.roughnessMap = t.rough;
      floorMat.color.set(floor === 'oak-planks' ? '#e9d9c4' : '#ffffff');
      floorMat.roughness = floor === 'concrete' ? 0.55 : floor === 'terracotta' ? 0.85 : 0.6;
      floorMat.normalScale.set(0.5, 0.5);
      floorMat.needsUpdate = true;
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [floor, quality, visible, floorMat, invalidate]);

  useEffect(
    () => () => {
      floorMat.dispose();
      wallMat.dispose();
      skirtMat.dispose();
    },
    [floorMat, wallMat, skirtMat],
  );

  const cx = leftWallX + ROOM_W / 2;
  const cz = backWallZ + ROOM_D / 2;
  return (
    <group visible={visible} name="room">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow material={floorMat}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
      </mesh>
      {/* back wall */}
      <mesh position={[cx, ROOM_H / 2, backWallZ]} receiveShadow material={wallMat}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
      </mesh>
      {/* left wall */}
      <mesh position={[leftWallX, ROOM_H / 2, cz]} rotation={[0, Math.PI / 2, 0]} receiveShadow material={wallMat}>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
      </mesh>
      <mesh position={[cx + SKIRT_T / 2, SKIRT_H / 2, backWallZ + SKIRT_T / 2]} material={skirtMat} receiveShadow>
        <boxGeometry args={[ROOM_W - SKIRT_T, SKIRT_H, SKIRT_T]} />
      </mesh>
      <mesh position={[leftWallX + SKIRT_T / 2, SKIRT_H / 2, cz + SKIRT_T / 2]} material={skirtMat} receiveShadow>
        <boxGeometry args={[SKIRT_T, SKIRT_H, ROOM_D - SKIRT_T]} />
      </mesh>
    </group>
  );
}

export const ROOM_SIZE = { width: ROOM_W, depth: ROOM_D, height: ROOM_H };
