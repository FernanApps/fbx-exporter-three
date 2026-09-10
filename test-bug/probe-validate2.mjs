import { readFileSync } from 'node:fs';
globalThis.self = globalThis;
globalThis.window = { innerWidth: 1920, innerHeight: 1080, URL: globalThis.URL };
const THREE = await import('three');
THREE.ColorManagement.enabled = false;
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const WHICH = process.argv[2] ?? 'actual';
const { FBXExporter } = await import(WHICH==='actual' ? '../dist/FBXExporter.js' : WHICH);
const GLB = String.raw`T:\Blender.3.6.23\_PersonajesETS2\Recepcionista\___________________Recepcionista-Accu-RIG__male-walk-2.glb`;
const buf = readFileSync(GLB);
const g = await new Promise((r,j)=>new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'',r,j));
const src = g.scene; src.animations = g.animations; src.updateMatrixWorld(true);
const bytes = await new FBXExporter().parseAsync(src, { preset:'blender', embedTextures:false });
const re = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
re.updateMatrixWorld(true);
const findSM=(r,n)=>{let m=null;r.traverse(o=>{if(!m&&o.isSkinnedMesh&&(!n||o.name===n))m=o;});return m;};
const A=findSM(src), B=findSM(re,A.name)??findSM(re);
console.log(`[${WHICH}] verts src=${A.geometry.attributes.position.count} re=${B.geometry.attributes.position.count} (indexado src=${!!A.geometry.index} re=${!!B.geometry.index})`);

function cloud(mesh){
  const g=mesh.geometry, n=g.attributes.position.count;
  const si=g.attributes.skinIndex, sw=g.attributes.skinWeight;
  const v=new THREE.Vector3(), out=new THREE.Vector3(), tmp=new THREE.Vector3(), M=new THREE.Matrix4();
  const pts=[];
  for(let i=0;i<n;i++){
    v.fromBufferAttribute(g.attributes.position,i).applyMatrix4(mesh.bindMatrix);
    out.set(0,0,0); let ws=0;
    for(let k=0;k<4;k++){ const w=sw.getComponent(i,k); if(!w) continue;
      const bi=si.getComponent(i,k); const b=mesh.skeleton.bones[bi]; if(!b) continue;
      M.multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[bi]);
      out.add(tmp.copy(v).applyMatrix4(M).multiplyScalar(w)); ws+=w; }
    if(!ws) out.copy(v);
    out.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
    pts.push(out.clone());
  }
  return pts;
}
function stats(pts){
  const bb=new THREE.Box3(); const c=new THREE.Vector3();
  for(const p of pts){ bb.expandByPoint(p); c.add(p); }
  c.divideScalar(pts.length);
  return {bb,c};
}
const fmt=(v)=>`(${v.toArray().map(x=>x.toFixed(3).padStart(7)).join(',')})`;
function cmp(label){
  src.updateMatrixWorld(true); re.updateMatrixWorld(true);
  const sa=stats(cloud(A)), sb=stats(cloud(B));
  const dmin=sa.bb.min.distanceTo(sb.bb.min), dmax=sa.bb.max.distanceTo(sb.bb.max), dc=sa.c.distanceTo(sb.c);
  console.log(`  [${label}] bbox src min${fmt(sa.bb.min)} max${fmt(sa.bb.max)}`);
  console.log(`  [${label}] bbox re  min${fmt(sb.bb.min)} max${fmt(sb.bb.max)}`);
  console.log(`  [${label}] centroide src${fmt(sa.c)} re${fmt(sb.c)}  -> dmin=${dmin.toFixed(4)} dmax=${dmax.toFixed(4)} dcentroide=${dc.toFixed(4)}`);
  return Math.max(dmin,dmax,dc);
}
const d0=cmp('pose base');
const mA=new THREE.AnimationMixer(src), mB=new THREE.AnimationMixer(re);
mA.clipAction(src.animations[0]).play(); mB.clipAction(re.animations[0]).play();
mA.update(0.5); mB.update(0.5);
const d1=cmp('t=0.5s');
console.log(`  VEREDICTO ${WHICH}: ${d1<0.01?'OK':'FALLA'} (desviacion animada ${d1.toFixed(4)} m)`);
