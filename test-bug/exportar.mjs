// Exporta un .glb (personaje+motion ya fusionado) a FBX listo para Cascadeur,
// usando el build LOCAL de la libreria parcheada.
//   node test-bug/exportar.mjs entrada.glb salida.fbx
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXExporter } from '../dist/FBXExporter.js';

const [,, SRC, OUT] = process.argv;
const buf = fs.readFileSync(SRC);
const g = await new Promise((r, j) => new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', r, j));
const scene = g.scene;
scene.updateMatrixWorld(true);

// 1) morph targets fuera: estan vacios (Basis / V_None) y crashean Cascadeur
let morphs = 0;
scene.traverse(o => {
  if (o.isMesh && o.morphTargetInfluences) {
    morphs += o.morphTargetInfluences.length;
    o.morphTargetInfluences = undefined;
    o.morphTargetDictionary = undefined;
    if (o.geometry) { o.geometry.morphAttributes = {}; o.geometry.morphTargetsRelative = false; }
  }
});

// 2) renombrar a CC_Base_* para que Cascadeur autodetecte los 65 puntos
const P = 'CC_Base_', ROOT = 'RL_BoneRoot';
const ren = new Map();
scene.traverse(o => {
  if (o.isBone && o.name !== ROOT && !o.name.startsWith(P)) ren.set(o.name, P + o.name);
});
const clips = g.animations;
for (const c of clips) for (const t of c.tracks) {
  const i = t.name.indexOf('.');
  const n = t.name.slice(0, i);
  if (ren.has(n)) t.name = ren.get(n) + t.name.slice(i);
}
scene.traverse(o => { if (ren.has(o.name)) o.name = ren.get(o.name); });
scene.animations = clips;

console.log(`E morphs quitados: ${morphs} | huesos renombrados: ${ren.size} | clips: ${clips.length}` +
  (clips[0] ? ` | ${clips[0].name} ${clips[0].duration.toFixed(2)}s ${clips[0].tracks.length} tracks` : ''));

const bytes = await new FBXExporter().parseAsync(scene, { preset: 'blender', embedTextures: false });
fs.writeFileSync(OUT, Buffer.from(bytes));
console.log('E OK ->', OUT, fs.statSync(OUT).size, 'bytes');
