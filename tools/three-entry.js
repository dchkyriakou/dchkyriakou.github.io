// Tree-shaken Three.js bundle for the site (only what the hero spectrogram uses).
// Rebuild: npx esbuild@0.24.0 tools/three-entry.js --bundle --format=esm --minify \
//          --outfile=assets/vendor/three.custom.min.js   (with three@0.170.0 resolvable)
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Color,
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, Points,
  ShaderMaterial, Vector2, Vector3
} from 'three';
