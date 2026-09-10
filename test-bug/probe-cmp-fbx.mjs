import { readFileSync } from 'node:fs';
import { parseFBX, findAll, cleanName, translationOf } from './fbx-binary-reader.mjs';

const files = process.argv.slice(2);
const BONES = ['Hip', 'L_Upperarm', 'L_Forearm', 'L_Hand'];
const f3 = (v) => v ? `(${v.map(x=>x.toFixed(3).padStart(9)).join(',')})` : 'n/a';

for (const file of files) {
  const tree = parseFBX(readFileSync(file));
  console.log(`\n########## ${file.split(/[\/]/).pop()}  (FBX v${tree.version}) ##########`);

  // GlobalSettings
  const gs = findAll(tree.nodes, 'GlobalSettings')[0];
  const p70 = gs && findAll(gs.children, 'P');
  const get = (n) => { const r = p70?.find(p => p.props[0].value === n); return r ? r.props.slice(4).map(x=>x.value) : null; };
  console.log('GlobalSettings: UpAxis', get('UpAxis'), 'FrontAxis', get('FrontAxis'), 'CoordAxis', get('CoordAxis'), 'UnitScaleFactor', get('UnitScaleFactor'));

  // Models
  const objects = findAll(tree.nodes, 'Objects')[0];
  const models = objects.children.filter(c => c.name === 'Model');
  const byUid = new Map();
  const counts = {};
  for (const m of models) {
    const nm = cleanName(m.props[1].value), sub = m.props[2].value;
    counts[sub] = (counts[sub]||0)+1;
    byUid.set(String(m.props[0].value), { nm, sub, node: m });
  }
  console.log('Models por subtipo:', JSON.stringify(counts));
  console.log('Models no-LimbNode:', models.filter(m=>m.props[2].value!=='LimbNode').map(m=>`${cleanName(m.props[1].value)}[${m.props[2].value}]`).join(', '));

  // conexiones OO para reconstruir padres
  const conns = findAll(tree.nodes, 'Connections')[0];
  const parentOf = new Map();
  for (const c of conns.children) {
    if (c.name !== 'C') continue;
    const [ty, a, b] = c.props.map(p=>p.value);
    if (ty !== 'OO') continue;
    if (byUid.has(String(a))) parentOf.set(String(a), String(b));
  }

  const prop = (m, name) => {
    const r = findAll(m.children, 'P').find(p => p.props[0].value === name);
    return r ? r.props.slice(4).map(x => x.value) : null;
  };

  // clusters
  const clusters = {};
  for (const node of objects.children) {
    if (node.name !== 'Deformer' || node.props[2]?.value !== 'Cluster') continue;
    const nm = cleanName(node.props[1].value);
    const rec = { tl: null, tr: null, tam: null, verts: 0 };
    for (const c of node.children) {
      if (c.name === 'Transform') rec.tr = c.props[0].value;
      else if (c.name === 'TransformLink') rec.tl = c.props[0].value;
      else if (c.name === 'TransformAssociateModel') rec.tam = c.props[0].value;
      else if (c.name === 'Indexes') rec.verts = c.props[0].value.length;
    }
    if (!clusters[nm] || rec.verts > clusters[nm].verts) clusters[nm] = rec;
  }
  // bindpose
  const poses = {};
  for (const pose of objects.children.filter(c=>c.name==='Pose')) {
    for (const pn of pose.children.filter(c=>c.name==='PoseNode')) {
      const nodeUid = String(findAll(pn.children,'Node')[0].props[0].value);
      const mat = findAll(pn.children,'Matrix')[0].props[0].value;
      const info = byUid.get(nodeUid);
      if (info) poses[info.nm] = mat;
    }
  }
  console.log(`clusters=${Object.keys(clusters).length}  poseNodes=${Object.keys(poses).length}`);
  console.log('TransformAssociateModel de Hip:', f3(translationOf(clusters['Hip']?.tam)),
    clusters['Hip']?.tam ? '(identidad? ' + clusters['Hip'].tam.every((v,i)=>Math.abs(v-[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1][i])<1e-9) + ')' : '');

  for (const b of BONES) {
    const e = [...byUid.values()].find(v => v.nm === b);
    console.log(`\n  --- ${b} ---`);
    if (e) {
      const pu = parentOf.get([...byUid.entries()].find(([,v])=>v===e)[0]);
      console.log(`    Model padre: ${pu && byUid.get(pu) ? byUid.get(pu).nm + '[' + byUid.get(pu).sub + ']' : '(raiz/desconocido)'}`);
      console.log(`    Lcl T ${f3(prop(e.node,'Lcl Translation'))}  Lcl R ${f3(prop(e.node,'Lcl Rotation'))}  Lcl S ${f3(prop(e.node,'Lcl Scaling'))}`);
      const pr = prop(e.node, 'PreRotation'), po = prop(e.node, 'PostRotation');
      if (pr) console.log(`    PreRotation ${f3(pr)}`);
      if (po) console.log(`    PostRotation ${f3(po)}`);
      const rp = prop(e.node,'RotationPivot'), sp = prop(e.node,'ScalingPivot');
      if (rp) console.log(`    RotationPivot ${f3(rp)}`);
      if (sp) console.log(`    ScalingPivot ${f3(sp)}`);
    } else console.log('    (no hay Model con ese nombre)');
    console.log(`    TransformLink ${f3(translationOf(clusters[b]?.tl))}   Transform ${f3(translationOf(clusters[b]?.tr))}`);
    console.log(`    PoseNode      ${f3(translationOf(poses[b]))}`);
  }
}
