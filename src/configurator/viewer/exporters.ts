import * as THREE from 'three';
import { labelRegistry } from './Dimensions.tsx';

export interface SnapshotOptions {
  /** Max width of the output image in px. */
  maxWidth?: number;
  type?: 'image/png' | 'image/jpeg';
  quality?: number;
  /** Draw the dimension labels and variant tags into the image (they are HTML overlays on screen). */
  labels?: boolean;
}

/**
 * Renders the current view and returns it as a data URL. Works without preserveDrawingBuffer:
 * the canvas is copied in the same task right after rendering.
 */
export function snapshot(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, o: SnapshotOptions = {}): string {
  gl.render(scene, camera);
  const src = gl.domElement;
  const scale = Math.min(1, (o.maxWidth ?? src.width) / src.width);
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return src.toDataURL(o.type ?? 'image/png');
  ctx.drawImage(src, 0, 0, w, h);
  if (o.labels !== false) drawLabels(ctx, camera, w, h);
  return c.toDataURL(o.type ?? 'image/png', o.quality ?? 0.9);
}

function drawLabels(ctx: CanvasRenderingContext2D, camera: THREE.Camera, w: number, h: number) {
  const v = new THREE.Vector3();
  const fontPx = Math.max(12, Math.round(w / 70));
  ctx.font = `600 ${fontPx}px "Hanken Grotesk Variable", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { position, text, kind } of labelRegistry.values()) {
    v.copy(position).project(camera);
    if (v.z > 1) continue;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    const tw = ctx.measureText(text).width;
    const padX = fontPx * 0.55;
    const bh = fontPx * 1.6;
    ctx.fillStyle = kind === 'tag' ? '#9c3f22' : 'rgba(255, 252, 246, 0.94)';
    roundRect(ctx, x - tw / 2 - padX, y - bh / 2, tw + padX * 2, bh, bh / 2);
    ctx.fill();
    if (kind === 'dim') {
      ctx.strokeStyle = 'rgba(58, 42, 30, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = kind === 'tag' ? '#ffffff' : '#2b2018';
    ctx.fillText(text, x, y + 1);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Exports the furniture (not the room, not the helpers) as a binary glTF (.glb). */
export async function exportGLB(scene: THREE.Scene): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const root = new THREE.Group();
  root.name = 'Faserlauf furniture';
  scene.traverse((o) => {
    if (o.userData['furniture'] && o.visible) {
      const clone = o.clone(true);
      clone.position.copy(o.position);
      root.add(clone);
    }
  });
  // GLTFExporter draws texture images into a 2D canvas; our textures are DataTextures (raw pixels from the
  // worker), so give the exported copies canvas-backed textures with the same pixels and settings.
  const texCache = new Map<THREE.Texture, THREE.Texture>();
  const toCanvasTexture = (t: THREE.Texture | null): THREE.Texture | null => {
    if (!t || !(t as THREE.DataTexture).isDataTexture) return t;
    const hit = texCache.get(t);
    if (hit) return hit;
    const img = t.image as { data: Uint8Array; width: number; height: number };
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    const c = new THREE.CanvasTexture(canvas);
    c.flipY = t.flipY;
    c.wrapS = t.wrapS;
    c.wrapT = t.wrapT;
    c.colorSpace = t.colorSpace;
    c.offset.copy(t.offset);
    c.repeat.copy(t.repeat);
    texCache.set(t, c);
    return c;
  };
  const matCache = new Map<THREE.Material, THREE.Material>();
  const convert = (m: THREE.Material) => {
    let out = matCache.get(m);
    if (!out) {
      const c = m.clone() as THREE.MeshPhysicalMaterial;
      // Color texture as JPEG; the fine normal/roughness detail is left out to keep the file small
      // (noise-like maps compress badly as PNG: ~5 MB with them, a few hundred KB without)
      c.map = toCanvasTexture(c.map);
      if (c.map) c.map.userData['mimeType'] = 'image/jpeg';
      c.normalMap = null;
      c.roughnessMap = null;
      out = c;
      matCache.set(m, out);
    }
    return out;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
  const bin = atob(b64 ?? '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
