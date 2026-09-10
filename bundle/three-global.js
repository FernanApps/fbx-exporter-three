// Shim: la libreria importa unas pocas clases de 'three'. En el visor, three ya
// esta cargado como script global (window.THREE), asi que las cogemos de ahi en
// vez de meter otro megabyte de three dentro del bundle.
const T = globalThis.THREE;
if (!T) throw new Error('fbx-exporter: falta three.js global (window.THREE)');
export const Matrix4 = T.Matrix4;
export const Euler = T.Euler;
export const Quaternion = T.Quaternion;
export const Vector3 = T.Vector3;
export const PropertyBinding = T.PropertyBinding;
export default T;
