# Shop resource recovery

Preview availability requires a complete, verified renderable asset connection. A failed conversion does not prove that a game resource is absent.

## Archive and model checks

- Enumerate loose files and every game PAK directory. Read the complete directory using its footer offset; a fixed-size tail can omit the beginning of large indices. Chromium DataPack files and unsupported containers must be reported separately.
- Compare declared model paths, animation aliases, material names, and archive entries. Preserve original source bytes and hashes. Do not silently substitute similarly named textures when several different files match.
- Texture aliases belong in the source manifest and identify the exact model, material name, and reviewed target. Unlisted aliases remain unavailable.
- DDS files with the observed incorrect `DDS_HEADER` size of 24 are repaired only in memory, after validating the DXT format, dimensions, mip count, and exact payload length.
- A genuinely untextured material can use its recorded diffuse RGBA color. A named but missing texture cannot use this fallback.
- An unused empty root helper does not prevent clothing conversion. It also must not take the animation name of a visible bone with the same exported name. Geometry and animation bindings share the same name normalization.
- Legacy character families require a compatible body and skeleton. Finding their meshes is insufficient to mark them compatible with the standard preview character.

## Couple motion checks

Unreleased rings are eligible when their actor animations and sound are complete. The intentional no-motion ring list remains excluded. Room ornaments and particles are optional: an absent ornament must not prevent a valid actor motion from being processed.

When default actor aliases are absent, use the explicitly mapped left male and right female aliases. Repeated identical actor curves can be collapsed; conflicting repeated body curves are rejected. Distinct exported skirt variants remain separately named.

When extending a published couple catalog, preserve existing ring descriptors, motion bytes, placements, same-sex references, and binding entries. Additional effect models and particle payloads must reference a texture revision that is actually published.

## Immutable asset reuse

An additive catalog may contain `shop/assets/{revision}/parent.json`:

```json
{"schema":"shop-assets-parent-v1","revision":"0123456789abcdef0123"}
```

The requested revision's own file takes precedence. Missing files can be resolved through validated parent revisions, with a maximum of eight revisions and cycle detection. Paths must remain inside the asset store. Malformed, oversized, missing, or invalid parent manifests fail closed. Existing revision lengths and immutable HTTP cache headers remain supported.

This allows an immutable catalog extension without duplicating unchanged models, textures, and thumbnails. The API supporting parent resolution must be deployed before activating such a catalog. Existing catalogs and assets remain intact for saved URLs.

## Verification

Run backend tests from the `backend` directory, frontend unit tests, and the complete Playwright suite. The resource recovery browser regression covers an unreleased ring becoming visible, pending motion loading at wide and narrow viewports, unchanged outfit selection, and a shared couple URL.

For actual recovered data, verify content hashes and every referenced asset, render the recovered clothing, decode the audio, sample the actor/effect/particle timeline, and check audio cleanup and URL preservation. Keep per-item findings and extraction failures in the local audit report.
