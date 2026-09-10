// Valida el bundle IIFE tal y como lo usara el navegador: three como global.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.THREE = THREE;
new Function(fs.readFileSync(new URL('./fbx-exporter.global.js', import.meta.url), 'utf8'))();
const { FBXExporter } = globalThis.FBXExporterLib;
console.log('B bundle cargado, FBXExporter:', typeof FBXExporter);

const src = process.argv[2], out = process.argv[3];
const b = fs.readFileSync(src);
const g = await new Promise((r,j)=> new GLTFLoader().parse(
  b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength), '', r, j));
g.scene.updateMatrixWorld(true);
g.scene.animations = g.animations;
const bytes = await new FBXExporter().parseAsync(g.scene, { preset:'blender', embedTextures:false });
fs.writeFileSync(out, Buffer.from(bytes));
console.log('B FBX escrito:', out, fs.statSync(out).size, 'bytes');
