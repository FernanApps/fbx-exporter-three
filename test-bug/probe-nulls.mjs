import { readFileSync } from 'node:fs';
import { parseFBX, findAll, cleanName } from './fbx-binary-reader.mjs';
const f3=(v)=>v?`(${v.map(x=>x.toFixed(3).padStart(9)).join(',')})`:'--';
for (const file of process.argv.slice(2)) {
  const tree = parseFBX(readFileSync(file));
  console.log(`\n##### ${file.split(/[\/]/).pop()}`);
  const gs = findAll(tree.nodes,'GlobalSettings')[0];
  const g = (n)=>{const r=findAll(gs.children,'P').find(p=>p.props[0].value===n);return r?r.props[4].value:null;};
  console.log(` GlobalSettings Up=${g('UpAxis')}/${g('UpAxisSign')} Front=${g('FrontAxis')}/${g('FrontAxisSign')} Coord=${g('CoordAxis')}/${g('CoordAxisSign')} Unit=${g('UnitScaleFactor')}`);
  const objects = findAll(tree.nodes,'Objects')[0];
  const prop=(m,n)=>{const r=findAll(m.children,'P').find(p=>p.props[0].value===n);return r?r.props.slice(4).map(x=>x.value):null;};
  for (const m of objects.children.filter(c=>c.name==='Model' && c.props[2].value!=='LimbNode')) {
    console.log(`  ${cleanName(m.props[1].value).padEnd(16)} [${m.props[2].value}] T${f3(prop(m,'Lcl Translation'))} R${f3(prop(m,'Lcl Rotation'))} S${f3(prop(m,'Lcl Scaling'))}`);
    for (const extra of ['PreRotation','RotationOffset','GeometricTranslation','GeometricRotation','GeometricScaling'])
      if (prop(m,extra)) console.log(`      ${extra} ${f3(prop(m,extra))}`);
  }
  // geometria: bbox de vertices
  for (const geo of objects.children.filter(c=>c.name==='Geometry')) {
    const v = findAll(geo.children,'Vertices')[0]?.props[0].value; if(!v) continue;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for(let i=0;i<v.length;i+=3) for(let k=0;k<3;k++){ mn[k]=Math.min(mn[k],v[i+k]); mx[k]=Math.max(mx[k],v[i+k]); }
    console.log(`  Geometry ${cleanName(geo.props[1].value).padEnd(14)} verts=${v.length/3} bbox min${f3(mn)} max${f3(mx)}`);
  }
}
