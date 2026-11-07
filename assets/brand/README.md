# takin' 2ku T2 logo

Source: the user-supplied `ネオン波紋のT2フィットネスロゴ.png`. The user's original file is unchanged.

The built-in ImageGen editor prepared a navy-background T2-only application icon from that reference. `t2-master.png` is the selected master. The transparent-cutout draft was rejected because its edges were unsuitable for a small icon. The selected image was reviewed before use.

Final edit prompt:

> Make an application icon by cropping/reframing the user's supplied logo; do not redesign it. Preserve the exact central T2 dumbbell-and-flexed-arm mark, its blue/cyan/lavender gradients, silhouette and arrangement. Keep the mark against a completely smooth solid very dark navy background (#020a24), NOT transparent. Remove only the peripheral wave decorations and small wordmark under T2. Fit the entire T2 mark centered in the middle 76 percent width of a square canvas, with adequate mask-safe padding. Crisp clean edges without stray pixels, white fringe, new outlines, particles or texture. No additional text. The symbol itself must remain faithful to the supplied artwork.

Run `node scripts/prepare-brand.mjs` to produce the small header crop at `public/brand/t2-header.png`, plus the 64/192/512 px PWA/browser icons at `public/icons/t2-*.png`. The large master is a development source asset and is not included in the offline download.
