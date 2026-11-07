# /story/ source

`app.js` is the 3D layer. It is bundled with three r170, GSAP 3.13 (ScrollTrigger) and Lenis 1.3.4 into
`../js/app.min.js` (tree-shaken, minified ESM):

    npx esbuild@0.24.0 story/src/app.js --bundle --format=esm --minify --legal-comments=none \
      --target=es2019 --outfile=story/js/app.min.js     # with three, gsap and lenis resolvable

`index.html` decides before first paint: `is-3d` (WebGL and motion allowed) loads the bundle;
`is-static` (reduced motion or no WebGL) and no-JS show the readable static page with photos.
