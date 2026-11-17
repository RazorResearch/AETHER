# Assets

The AETHER mark and all interface iconography are inline SVG so they can inherit
theme tokens:

- Brand mark: `src/components/ui/Logo.tsx`
- Icons: [lucide-react](https://lucide.dev) (stroke 1.6–1.75)
- Charts: Recharts + hand-written SVG (`src/components/charts`)

Put raster or binary assets here only when they cannot be expressed as themed
SVG (for example documentation screenshots). The current build ships no raster
assets and no external image requests.
