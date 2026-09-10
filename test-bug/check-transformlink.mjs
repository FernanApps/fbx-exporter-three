/**
 * Test de regresion: TransformLink de los Deformer(Cluster) del FBX exportado.
 *
 * BUG CONOCIDO
 * ------------
 * Al exportar una escena three.js con SkinnedMesh + animacion, el TransformLink
 * de cada Cluster se escribe en un espacio de coordenadas equivocado (queda en
 * metros / Z-up, en vez de cm / Y-up), y la malla sale retorcida.
 *
 * Referencia sobre el hueso L_Hand del mismo GLB:
 *   correcto (lo que escribe Blender):  (63.127, 140.163, 5.135)  cm, Y-up
 *   lo que escribe la libreria:         ( 0.631,   0.045, 1.402)  m,  Z-up
 *
 * Uso:
 *   node test-bug/check-transformlink.mjs [ruta.glb] [nombreHueso]
 *
 * Sale con codigo 0 si el TransformLink es correcto, 1 si reproduce el bug.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFBX, collectClusters, translationOf } from './fbx-binary-reader.mjs';

// ---------------------------------------------------------------- parametros
const __dirname = dirname(fileURLToPath(import.meta.url));

const GLB_PATH = process.argv[2] ?? String.raw`T:\Blender.3.6.23\_PersonajesETS2\Recepcionista\___________________Recepcionista-Accu-RIG__male-walk-2.glb`;
const BONE = process.argv[3] ?? 'L_Hand';

/** Valor que escribe Blender para el mismo hueso (cm, Y-up). */
const EXPECTED = [0.6310, 1.4017, -0.0459]   // metros, Y-up. Blender escribe (63.095, 140.168, -4.588) cm
/** Valor erroneo actual, para reconocer la firma del bug (m, Z-up). */
const BUGGY = [0.631, 0.045, 1.402];
/** Tolerancia: 1 cm. */
const TOL = 0.01

const OUT_DIR = resolve(__dirname, '../out');
const FBX_PATH = resolve(OUT_DIR, 'transformlink-check.fbx');

// three.js examples/jsm asume un entorno de navegador
globalThis.self = globalThis;
globalThis.window = { innerWidth: 1920, innerHeight: 1080, URL: globalThis.URL };

const THREE = await import('three');
THREE.ColorManagement.enabled = false;
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

// IMPORTANTE: build LOCAL del repo (dist/), no el paquete publicado en npm.
const { FBXExporter } = await import('../dist/FBXExporter.js');

const fmt = (v) => (v === null ? 'n/a' : `(${v.map((x) => x.toFixed(3).padStart(9)).join(', ')})`);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

console.log('=== Regresion: TransformLink de Deformer(Cluster) ===\n');
console.log(`GLB   : ${GLB_PATH}`);
console.log(`hueso : ${BONE}\n`);

// ------------------------------------------------------- 1. cargar el GLB
const glbBuf = readFileSync(GLB_PATH);
const arrayBuf = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

const gltf = await new Promise((res, rej) => {
  new GLTFLoader().parse(arrayBuf, '', res, rej);
});

const root = gltf.scene;
root.animations = gltf.animations ?? [];

const skinned = [];
const bones = new Set();
root.traverse((o) => {
  if (o.isSkinnedMesh) skinned.push(o);
  if (o.isBone) bones.add(o);
});
for (const sm of skinned) for (const b of sm.skeleton.bones) bones.add(b);

console.log(`1) GLTFLoader: skinnedMeshes=${skinned.length}  huesos=${bones.size}  clips=${root.animations.length}`);

const boneObj = [...bones].find((b) => b.name === BONE);
if (boneObj) {
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3().setFromMatrixPosition(boneObj.matrixWorld);
  console.log(`   pos. mundial de ${BONE} en la escena three.js (m, Y-up): ${fmt([p.x, p.y, p.z])}`);
} else {
  console.log(`   AVISO: no hay ningun hueso llamado exactamente "${BONE}" en la escena`);
}

// ---------------------------------------------- 2. exportar con el build local
const bytes = await new FBXExporter().parseAsync(root, {
  preset: 'blender',
  embedTextures: false,
});
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(FBX_PATH, bytes);
console.log(`\n2) FBX exportado (preset=blender, embedTextures=false): ${FBX_PATH}  (${bytes.length} bytes)`);

// ------------------------------------------------- 3. parsear el FBX binario
const tree = parseFBX(bytes);
const clusters = collectClusters(tree);
console.log(`\n3) FBX v${tree.version}: ${clusters.length} Deformer(Cluster) encontrados`);

// Hay un Cluster por (skin x hueso); pueden salir varios con el mismo nombre.
const matches = clusters.filter((c) => c.name === BONE);
if (matches.length === 0) {
  console.error(`\nERROR: no se encontro Cluster para "${BONE}". Clusters disponibles (primeros 20):`);
  console.error('  ' + clusters.slice(0, 20).map((c) => c.name).join(', '));
  process.exit(2);
}

for (const c of matches) {
  console.log(`\n   Cluster "${c.name}"  (verts influidos: ${c.vertexCount ?? 0})`);
  console.log(`     TransformLink  traslacion : ${fmt(translationOf(c.transformLink))}`);
  console.log(`     Transform      traslacion : ${fmt(translationOf(c.transform))}`);
}

// Para el veredicto usamos el cluster que realmente deforma vertices.
const hit = matches.find((c) => (c.vertexCount ?? 0) > 0) ?? matches[0];
const tl = translationOf(hit.transformLink);
const tr = translationOf(hit.transform);
if (matches.length > 1) console.log(`\n   -> se evalua el cluster con ${hit.vertexCount ?? 0} vertices influidos`);
void tr;

// ------------------------------------------------------------- 4. veredicto
console.log('\n4) Comparacion de TransformLink');
console.log(`     esperado (Blender, cm Y-up) : ${fmt(EXPECTED)}`);
console.log(`     obtenido                    : ${fmt(tl)}`);
console.log(`     firma del bug (m, Z-up)     : ${fmt(BUGGY)}`);

const dExpected = dist3(tl, EXPECTED);
const dBuggy = dist3(tl, BUGGY);
console.log(`     distancia al esperado       : ${dExpected.toFixed(3)}  (tolerancia ${TOL.toFixed(1)})`);
console.log(`     distancia al valor buggy    : ${dBuggy.toFixed(3)}`);

if (dExpected <= TOL) {
  console.log('\nVEREDICTO: OK — TransformLink esta en el espacio correcto.');
  process.exit(0);
}

console.log(
  dBuggy <= TOL
    ? '\nVEREDICTO: FALLA — reproduce exactamente el bug conocido (m, Z-up).'
    : '\nVEREDICTO: FALLA — TransformLink fuera de tolerancia (y tampoco coincide con la firma conocida del bug).',
);
process.exit(1);
