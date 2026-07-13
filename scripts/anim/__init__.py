"""Marketing-only scene animation primitives + catalogue loader.

Deliberately outside the canonical mint/render pipeline: the render-path modules
here (catalogue.py, primitives.py, expression_deltas.py) never import
chromies-engine, trait-byte-registry, or any compiled palette/trait artifact, and
never write anywhere near payload/trait data. See scripts/animate-scene.py for the
renderer.

Three scripts are a deliberate, narrow exception to that boundary: compile-face-
regions.py, build-smile-transition.py, and render-expression-prototype.py (all
scripts/anim/, not importable as package modules -- they're run standalone) are
one-shot *compile steps*, in the same spirit as
chromies-engine/export_traits_from_art_pipeline.py. They read compiled trait
tables + real component art once, offline, and write/consume static JSON
artifacts (face-regions.json, expression-transitions.json) without the render-path
modules above ever touching chromies-engine themselves.

As of "Rework Prototype onto Canonical Bytes + JS Compositor", none of these three
compile steps import chromies-engine's Python *compositor* any more (it is known
to diverge from public/data/mint-data.json -- see
scripts/verify/pipeline-parity-check.py, the permanent standing report for that
divergence). They use two shared helpers instead:
  - _canonical_token_source.py: pure pixelsHex/traitsHex decode straight out of
    public/data/mint-data.json (no compositing, no RNG -- the bytes ARE the
    ground truth). The only remaining chromies-engine import anywhere in this
    package is via this module, and it's a pure decode/palette-lookup helper.
  - _expression_swap_source.py: determines a real token's "expression" (mouth)
    pick, and renders expression-swapped variants, via the REAL JS art-pipeline
    pipeline (called through Node, never reimplemented), self-verified
    byte-for-byte against each token's committed record before being trusted.
"""
