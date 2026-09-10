/**
 * Lector minimo de FBX binario (solo lo necesario para inspeccionar nodos).
 * Portado del script Python `fbxkeys.py` usado durante el diagnostico.
 *
 * Devuelve un arbol de nodos { name, props: [{type, value}], children: [] }.
 */
import { inflateSync } from 'node:zlib';

const MAGIC = 'Kaydara FBX Binary  ';

function readProp(buf, p) {
  const type = String.fromCharCode(buf[p]); p += 1;
  switch (type) {
    case 'C': case 'B': return { prop: { type, value: buf.readInt8(p) !== 0 }, p: p + 1 };
    case 'Y': return { prop: { type, value: buf.readInt16LE(p) }, p: p + 2 };
    case 'I': return { prop: { type, value: buf.readInt32LE(p) }, p: p + 4 };
    case 'F': return { prop: { type, value: buf.readFloatLE(p) }, p: p + 4 };
    case 'D': return { prop: { type, value: buf.readDoubleLE(p) }, p: p + 8 };
    case 'L': return { prop: { type, value: buf.readBigInt64LE(p) }, p: p + 8 };
    case 'f': case 'd': case 'l': case 'i': case 'b': {
      const n = buf.readUInt32LE(p);
      const enc = buf.readUInt32LE(p + 4);
      const cl = buf.readUInt32LE(p + 8);
      p += 12;
      let raw = buf.subarray(p, p + cl);
      p += cl;
      if (enc === 1) raw = inflateSync(raw);
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        if (type === 'f') out[i] = raw.readFloatLE(i * 4);
        else if (type === 'd') out[i] = raw.readDoubleLE(i * 8);
        else if (type === 'l') out[i] = raw.readBigInt64LE(i * 8);
        else if (type === 'i') out[i] = raw.readInt32LE(i * 4);
        else out[i] = raw.readInt8(i);
      }
      return { prop: { type, value: out }, p };
    }
    case 'S': case 'R': {
      const len = buf.readUInt32LE(p); p += 4;
      const raw = buf.subarray(p, p + len); p += len;
      return { prop: { type, value: type === 'S' ? raw.toString('utf8') : raw }, p };
    }
    default:
      throw new Error(`tipo de propiedad FBX desconocido: '${type}' en offset ${p - 1}`);
  }
}

function walk(buf, pos, end, wide) {
  const out = [];
  const hdrSize = wide ? 25 : 13;
  while (pos < end) {
    let endOffset, numProps;
    if (wide) {
      endOffset = Number(buf.readBigUInt64LE(pos));
      numProps = Number(buf.readBigUInt64LE(pos + 8));
      pos += 24;
    } else {
      endOffset = buf.readUInt32LE(pos);
      numProps = buf.readUInt32LE(pos + 4);
      pos += 12;
    }
    const nameLen = buf[pos]; pos += 1;
    if (endOffset === 0) break;          // null record = fin de lista
    const name = buf.subarray(pos, pos + nameLen).toString('utf8'); pos += nameLen;

    let p = pos;
    const props = [];
    for (let i = 0; i < numProps; i++) {
      const r = readProp(buf, p);
      props.push(r.prop);
      p = r.p;
    }
    const children = p < endOffset - hdrSize ? walk(buf, p, endOffset, wide) : [];
    pos = endOffset;
    out.push({ name, props, children });
  }
  return out;
}

/** Parsea un Buffer/Uint8Array de FBX binario. */
export function parseFBX(bytes) {
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength);
  if (buf.subarray(0, MAGIC.length).toString('binary') !== MAGIC) {
    throw new Error('no es un FBX binario (falta la cabecera "Kaydara FBX Binary")');
  }
  const version = buf.readUInt32LE(23);
  return { version, nodes: walk(buf, 27, buf.length, version >= 7500) };
}

/** Busca recursivamente todos los nodos con un nombre dado. */
export function findAll(nodes, name, acc = []) {
  for (const n of nodes) {
    if (n.name === name) acc.push(n);
    findAll(n.children, name, acc);
  }
  return acc;
}

/**
 * Nombre limpio de un objeto FBX. Los nombres vienen como
 * "Deformer::L_Hand" + separador NUL/SOH + "SubDeformer".
 */
export function cleanName(s) {
  const base = String(s).split('\u0000')[0];
  const i = base.lastIndexOf('::');
  return i === -1 ? base : base.slice(i + 2);
}

/**
 * Devuelve todos los Deformer de subtipo "Cluster" con sus matrices
 * Transform / TransformLink (arrays de 16 doubles, orden fila-mayor FBX).
 */
export function collectClusters(tree) {
  const out = [];
  for (const objects of findAll(tree.nodes, 'Objects')) {
    for (const node of objects.children) {
      if (node.name !== 'Deformer') continue;
      if (node.props.length < 3 || node.props[2].value !== 'Cluster') continue;
      const rec = {
        name: cleanName(node.props[1].value),
        transform: null,
        transformLink: null,
        vertexCount: null,
      };
      for (const c of node.children) {
        if (c.name === 'Transform') rec.transform = c.props[0]?.value ?? null;
        else if (c.name === 'TransformLink') rec.transformLink = c.props[0]?.value ?? null;
        else if (c.name === 'Indexes') rec.vertexCount = c.props[0]?.value?.length ?? null;
      }
      out.push(rec);
    }
  }
  return out;
}

/** Traslacion (m[12], m[13], m[14]) de una matriz FBX de 16 doubles. */
export function translationOf(m) {
  return m ? [m[12], m[13], m[14]] : null;
}
