import { readFileSync } from 'node:fs';
globalThis.self = globalThis;
globalThis.window = { innerWidth: 1920, innerHeight: 1080, URL: globalThis.URL };
const THREE = await import('three');
THREE.ColorManagement.enabled = false;
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

const GLB = process.argv[2] ?? String.raw`T:\Blender.3.6.23\_PersonajesETS2\Recepcionista\___________________Recepcionista-Accu-RIG__male-walk-2.glb`;
const buf = readFileSync(GLB);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await new Promise((r, j) => new GLTFLoader().parse(ab, '', r, j));
const root = gltf.scene;
root.updateMatrixWorld(true);

const f = (v) => `(${[...v].map((x) => (+x).toFixed(4).padStart(9)).join(',')})`;
const pos = (m) => { const p = new THREE.Vector3().setFromMatrixPosition(m); return [p.x, p.y, p.z]; };

let sm = null; root.traverse((o) => { if (!sm && o.isSkinnedMesh) sm = o; });
console.log('mesh          :', sm.name);
console.log('mesh.matrixWorld pos', f(pos(sm.matrixWorld)), 'isIdentity?',
  sm.matrixWorld.elements.every((e, i) => Math.abs(e - [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1][i]) < 1e-9));
console.log('bindMatrix identity?',
  sm.bindMatrix.elements.every((e, i) => Math.abs(e - [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1][i]) < 1e-9));
console.log('bindMode      :', sm.bindMode);
console.log('clips         :', gltf.animations.map((c) => c.name).join(' | '));

// bbox de la geometria cruda
sm.geometry.computeBoundingBox();
const bb = sm.geometry.boundingBox;
console.log('\ngeom bbox min', f([bb.min.x, bb.min.y, bb.min.z]), ' max', f([bb.max.x, bb.max.y, bb.max.z]));
const size = bb.getSize(new THREE.Vector3());
console.log('geom bbox size', f([size.x, size.y, size.z]), '-> eje mas largo:', ['X','Y','Z'][[size.x,size.y,size.z].indexOf(Math.max(size.x,size.y,size.z))]);

// cadena de padres del root bone
const sk = sm.skeleton;
let rb = sk.bones[0]; while (rb.parent && rb.parent.isBone) rb = rb.parent;
console.log('\nroot bone     :', rb.name);
let p = rb, chain = [];
while (p) { chain.push(`${p.name || p.type}[rot ${f([p.rotation.x,p.rotation.y,p.rotation.z])}]`); p = p.parent; }
console.log('cadena hasta la raiz:\n  ' + chain.join('\n  '));

// D_i = bone.matrixWorld * boneInverse en POSE BASE (sin ninguna accion)
console.log('\n=== POSE BASE (sin accion) : D_i = bone.matrixWorld * boneInverse_i ===');
const Ds = [];
for (let i = 0; i < sk.bones.length; i++) {
  const D = new THREE.Matrix4().multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]);
  Ds.push(D);
}
const D0 = Ds[0];
let maxDev = 0, worst = '';
for (let i = 0; i < Ds.length; i++) {
  let d = 0; for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(Ds[i].elements[k] - D0.elements[k]));
  if (d > maxDev) { maxDev = d; worst = sk.bones[i].name; }
}
console.log('D[0] (' + sk.bones[0].name + ') =');
console.log('  ', f(D0.elements.slice(0,4)), '\n  ', f(D0.elements.slice(4,8)), '\n  ', f(D0.elements.slice(8,12)), '\n  ', f(D0.elements.slice(12,16)));
console.log(`max desviacion de D_i respecto a D_0 : ${maxDev.toFixed(6)}  (peor: ${worst})`);
console.log('=> ' + (maxDev < 1e-4
  ? 'TODOS los D_i son la MISMA matriz constante: la pose base COINCIDE con la bind pose salvo un cambio de espacio global.'
  : 'los D_i DIFIEREN entre huesos: la pose base NO es la bind pose (hay pose por hueso).'));

// comparacion directa por hueso
console.log('\n=== por hueso (pose base) ===');
const names = ['L_Hand', 'R_Hand', sk.bones[0].name, rb.name];
for (const n of names) {
  const i = sk.bones.findIndex((b) => b.name === n);
  if (i < 0) { console.log(`  ${n}: no esta en el skeleton`); continue; }
  const bindW = new THREE.Matrix4().copy(sk.boneInverses[i]).invert();
  console.log(`  ${n.padEnd(12)} matrixWorld ${f(pos(sk.bones[i].matrixWorld))}   inv(boneInverse) ${f(pos(bindW))}`);
}
