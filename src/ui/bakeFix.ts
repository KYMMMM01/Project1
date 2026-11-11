/**
 * Pixi 8.22 bakes a cached leaf (a Graphics, Sprite or Text that is its own `cacheAsTexture` root)
 * with the alpha and tint of every ancestor up to the nearest render group, and multiplies them in
 * again when it draws the baked texture. A cached icon built while its popup was fading in (the first
 * frame is drawn at alpha 0.1 to 0.3) therefore stayed at that alpha for good, with the overlap of its
 * outline and fill showing through as a ghost; the same happens to a cached piece that carries its own
 * `alpha` or `tint`, which was applied twice. The baked pixels must be neutral: the bake of a cached
 * root sees it as opaque white, and the one place that draws the texture applies the real values.
 *
 * Also (second patch below): a baked piece's quad is sent to the graphics card again only when it changed.
 *
 * Imported for its effect by `shapes.ts` (every cached piece of the game goes through `cacheStatic`).
 */
import { BatchableGraphics, BatchableSprite, GraphicsPipe, RenderGroupPipe, type Container, type Graphics, type RenderGroup } from 'pixi.js';

/** Packed ABGR of an opaque white: what Pixi stores in `groupColorAlpha` for a plain container. */
const OPAQUE = 0xffffff + (255 << 24);

/** True for a container that draws itself into its own cached texture: its own pixels are the bake. */
export function bakesItself(c: Container): boolean {
  const group = c.renderGroup;
  return group != null && group.isCachedAsTexture && group.root === c;
}

/** Run `fn` with the container's inherited and own colour and alpha reading as opaque white. */
export function withOpaqueRoot<T>(c: Container, fn: () => T): T {
  const { groupColor, groupAlpha, groupColorAlpha } = c;
  c.groupColor = 0xffffff;
  c.groupAlpha = 1;
  c.groupColorAlpha = OPAQUE;
  try {
    return fn();
  } finally {
    c.groupColor = groupColor;
    c.groupAlpha = groupAlpha;
    c.groupColorAlpha = groupColorAlpha;
  }
}

function patchColour<B extends { renderable: Container | null }>(proto: B, isBake: (batch: B, root: Container) => boolean): void {
  const orig = Object.getOwnPropertyDescriptor(proto, 'color')?.get;
  if (!orig) return;
  Object.defineProperty(proto, 'color', {
    configurable: true,
    get(this: B): number {
      const root = this.renderable;
      if (root && isBake(this, root)) return withOpaqueRoot(root, () => orig.call(this) as number);
      return orig.call(this) as number;
    },
  });
}

/** Batched graphics pack their colour into the vertex buffer; the batch of a baked sprite is `_batchableRenderGroup`. */
patchColour(BatchableGraphics.prototype, (_batch, root) => bakesItself(root));
patchColour(BatchableSprite.prototype, (batch, root) => bakesItself(root) && batch !== root.renderGroup._batchableRenderGroup);

/** A graphics too big to batch is drawn with the colour in a uniform read at execute time. */
const pipe = GraphicsPipe.prototype;
const execute = pipe.execute;
pipe.execute = function (this: GraphicsPipe, graphics: Graphics): void {
  if (bakesItself(graphics)) withOpaqueRoot(graphics, () => execute.call(this, graphics));
  else execute.call(this, graphics);
};

/*
 * Pixi 8.22 draws a baked piece by re-packing its quad and re-sending the parent group's whole vertex buffer, every frame, changed or
 * not, in the middle of the frame (`RenderGroupPipe._executeCacheAsTexture`). A list with dozens of baked pieces sent the same buffer
 * dozens of times a frame, each time one the frame had already drawn from, so the graphics card had to catch up first: scrolling the
 * shop spent 96 % of its frame there (tools/perf/profile.mjs). The quad only needs it when the bake was redrawn or its place or colour
 * moved; a rebuilt group packs every quad afresh on its own.
 */
type CachedPipe = {
  _addRenderableCacheAsTexture(group: RenderGroup, set: unknown): void;
  _executeCacheAsTexture(group: RenderGroup): void;
};
const groupPipe = RenderGroupPipe.prototype as unknown as CachedPipe;
const executeCached = groupPipe._executeCacheAsTexture;
const addCached = groupPipe._addRenderableCacheAsTexture;
/** What each baked piece's quad was last sent with: the 6 numbers of its transform, its colour, its texture. */
const sentWith = new WeakMap<RenderGroup, Float64Array>();
// A rebuilt parent packs the quad with the values of that moment, which may be ones never sent (Pixi skips drawing a piece at alpha 0,
// a rebuild still packs it at alpha 0): forget what was sent, so the next draw sends it again.
groupPipe._addRenderableCacheAsTexture = function (this: CachedPipe, group: RenderGroup, set: unknown): void {
  sentWith.delete(group);
  addCached.call(this, group, set);
};
groupPipe._executeCacheAsTexture = function (this: CachedPipe, group: RenderGroup): void {
  const quad = group._batchableRenderGroup;
  const m = group.root.relativeGroupTransform;
  const color = quad.color;
  const texture = group.texture?.uid ?? -1;
  let last = sentWith.get(group);
  if (!group.textureNeedsUpdate && last && last[0] === m.a && last[1] === m.b && last[2] === m.c && last[3] === m.d && last[4] === m.tx && last[5] === m.ty && last[6] === color && last[7] === texture) {
    return;
  }
  if (!last) sentWith.set(group, (last = new Float64Array(8)));
  last[0] = m.a;
  last[1] = m.b;
  last[2] = m.c;
  last[3] = m.d;
  last[4] = m.tx;
  last[5] = m.ty;
  last[6] = color;
  last[7] = texture;
  executeCached.call(this, group);
};
