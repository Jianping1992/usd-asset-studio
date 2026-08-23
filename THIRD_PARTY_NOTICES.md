# Third-Party Notices

This document identifies the principal third-party components used by USD Asset Studio. It is provided for attribution and dependency-boundary clarity; it is not legal advice and does not replace the complete license texts distributed by each dependency.

The repository-level [MIT License](./LICENSE) applies only to project-authored code, documentation, and demo assets, and only to the extent the contributors hold rights in those materials. It does **not** relicense the packages, WebAssembly binaries, generated bundles, embedded third-party elements, or other third-party materials listed below.

## Needle USD

- Package: `@needle-tools/usd`
- Version locked by this project: `1.1.2`
- Author/maintainer: Needle
- Package homepage: <https://needle.tools>
- Source repository declared by the package: <https://github.com/needle-tools/usd-viewer>
- License declared by the installed package: **PolyForm-Noncommercial-1.0.0**
- License terms: <https://polyformproject.org/licenses/noncommercial/1.0.0/>
- Commercial licensing contact published by the package: <mailto:hi@needle.tools>

This package provides the OpenUSD WebAssembly runtime and the Three.js Hydra render delegate used by USD Asset Studio. Commercial use is not granted by the repository's MIT License; contact Needle for an appropriate commercial license.

`@needle-tools/usd` must not be described as an Apache-licensed Needle runtime. It is built using upstream OpenUSD technology, but the installed npm package itself declares `PolyForm-Noncommercial-1.0.0`.

## Needle MaterialX (transitive dependency)

- Package: `@needle-tools/materialx`
- Version resolved by this project: `1.7.3`
- Dependency path: `usd-asset-studio → @needle-tools/usd@1.1.2 → @needle-tools/materialx@1.7.3`
- Author/maintainer: Needle
- Source repository declared by the package: <https://github.com/needle-tools/needle-engine-materialx>
- License declared by the installed package: **PolyForm-Noncommercial-1.0.0**
- License terms: <https://polyformproject.org/licenses/noncommercial/1.0.0/>
- Commercial licensing contact: <mailto:hi@needle.tools>

MaterialX is an indirect runtime dependency. Its presence in the dependency graph or generated Vite assets does not mean that USD Asset Studio implements MaterialX editing as an application feature, and it is not covered by the project's MIT License.

## OpenUSD and upstream components

The OpenUSD WebAssembly artifacts consumed by this application are delivered through `@needle-tools/usd`. OpenUSD and any upstream components incorporated into that build retain their own copyright notices and license terms. Those upstream terms do not relicense the complete Needle package: for the JavaScript/WASM runtime distributed as `@needle-tools/usd`, observe the package's PolyForm Noncommercial terms above.

For upstream OpenUSD project information and notices, see <https://github.com/PixarAnimationStudios/OpenUSD>. When redistributing a build, preserve all notices and license files supplied by the actual packages and build artifacts being distributed.

## Other principal direct dependencies

The following versions are locked in this project's `package-lock.json`. Each remains subject to its own license and notice files in the installed package.

| Component | Version | Declared license | Role |
| --- | ---: | --- | --- |
| Three.js (`three`) | 0.185.0 | MIT | WebGL scene, camera, controls and GPU resources |
| Apache ECharts (`echarts`) | 6.1.0 | Apache-2.0 | Dashboard charts |
| Fastify (`fastify`) | 5.12.1 | MIT | Local REST and static server |
| React (`react`) | 18.3.1 | MIT | User interface runtime |
| React DOM (`react-dom`) | 18.3.1 | MIT | Browser renderer |
| React Router DOM | 7.18.2 | MIT | Client-side routing |
| Zustand | 4.5.7 | MIT | Frontend state coordination |
| Vite | 8.2.2 | MIT | Development server and build pipeline |
| TypeScript | 5.7.3 | Apache-2.0 | Type checking and compilation |
| Lucide React | 0.468.0 | ISC | Interface icons |

This table highlights principal dependencies rather than reproducing every transitive package. `package-lock.json` is the source of truth for the resolved dependency graph. A distributor is responsible for reviewing and preserving the license/notice files for the exact dependency set and generated artifacts it ships.

## No trademark grant

Names such as Needle, OpenUSD, Pixar, Three.js, Apache ECharts, Fastify, and React belong to their respective owners. Inclusion here is for identification and attribution only and does not imply endorsement or grant trademark rights.
