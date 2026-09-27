# Attribution

The pinned Better Interface reference was applied to construction and review across accessibility, layout, writing, typography, colors and UI details. It is adapted from **Jakub Krehel's Better Interface**, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`: [upstream](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface).

The implemented-design documentation method is adapted from **Paul Bakaus's Impeccable**, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`: [upstream document reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md). These works retain their separate licenses; applying their principles does not relicense either work. The original guide text is not redistributed with this frontend.

`web/src/math.ts` ports the integer `getSqrtPriceAtTick` calculation from the repository's pinned **Uniswap v4-core TickMath.sol**, SPDX MIT. [Uniswap source](https://github.com/Uniswap/v4-core/blob/main/src/libraries/TickMath.sol). The conversion uses the same constants and rounding; its origin is identified next to the implementation. The rest of the frontend follows the repository's existing MIT license.

**DM Sans** is bundled through `@fontsource-variable/dm-sans` under the SIL Open Font License 1.1. Its exact license is retained at `web/public/DM-Sans-LICENSE.txt` and exported as `dist/DM-Sans-LICENSE.txt`. The font is unmodified. React, React DOM and viem retain their respective dependency licenses; the dependency versions and resolved integrity records are in `web/package-lock.json`.

The small Band mark, line icons and CSS diagram were created for this interface. No third-party photographs, remote visual assets, raster generation, or icon package are used.
