// Tree-shaken Three.js bundle for the site (only what the hero and knowledge map use).
// Rebuild: npx esbuild@0.24.0 tools/three-entry.js --bundle --format=esm --minify \
//          --outfile=assets/vendor/three.custom.min.js   (with three@0.170.0 resolvable)
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Color, Fog,
  BufferGeometry, BufferAttribute, Float32BufferAttribute,
  LineSegments, LineBasicMaterial, Points, ShaderMaterial,
  Vector2, Vector3, Raycaster, AdditiveBlending, NormalBlending, MathUtils
} from 'three';
