export const GRID = 64;
export const PIXELS = GRID * GRID;
export const PACKED_BUFFER_BYTES = 2048;

export const TYPES = ["Human", "Cat", "Alien", "Droid", "Specter"] as const;
export const EXPRESSIONS = ["Neutral", "Smile", "Serious", "Smug", "Surprised", "Sleepy"] as const;
export const HEADGEAR = ["None", "Cap", "Crown", "Halo", "Antenna", "Top Hat", "Visor", "Beanie"] as const;
export const EYEWEAR = ["None", "Shades", "Round Glasses", "Visor", "Eyepatch", "VR"] as const;
export const PALETTES = ["Ember", "Tide", "Dusk", "Verdant", "Mono+", "Candy"] as const;

type Traits = {
  typeId: number;
  expressionId: number;
  headgearId: number;
  eyewearId: number;
  paletteId: number;
};

export type GeneratedToken = {
  tokenId: number;
  traits: Traits;
  traitBytesHex: `0x${string}`;
  indexBuffer: Uint8Array;
  packedBufferHex: `0x${string}`;
};

type DrawCtx = {
  buf: Uint8Array;
  set: (x: number, y: number, value: number) => void;
  fillRect: (x: number, y: number, w: number, h: number, value: number) => void;
  drawCircle: (cx: number, cy: number, r: number, value: number) => void;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng: () => number, weights: number[]): number {
  let sum = 0;
  for (const weight of weights) sum += weight;
  let roll = rng() * sum;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function createContext(): DrawCtx {
  const buf = new Uint8Array(PIXELS);
  const set = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    buf[y * GRID + x] = value & 0x0f;
  };
  const fillRect = (x: number, y: number, w: number, h: number, value: number) => {
    for (let iy = y; iy < y + h; iy++) {
      for (let ix = x; ix < x + w; ix++) set(ix, iy, value);
    }
  };
  const drawCircle = (cx: number, cy: number, r: number, value: number) => {
    const rr = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rr) set(x, y, value);
      }
    }
  };
  return { buf, set, fillRect, drawCircle };
}

function buildTraits(tokenId: number, rng: () => number): Traits {
  const typeId = pickWeighted(rng, [34, 16, 13, 22, 15]);
  const expressionId = pickWeighted(rng, [26, 20, 15, 13, 14, 12]);
  const headgearId = pickWeighted(rng, [40, 14, 8, 8, 8, 8, 8, 6]);
  const eyewearId = pickWeighted(rng, [42, 16, 12, 10, 8, 12]);
  const paletteId = (Math.imul(tokenId, 2654435761) >>> 0) % PALETTES.length;
  return { typeId, expressionId, headgearId, eyewearId, paletteId };
}

function drawBaseHead(ctx: DrawCtx, rng: () => number, traits: Traits): { cx: number; top: number; hw: number; hh: number } {
  const { set } = ctx;
  const cx = 32;
  const top = 13 + Math.floor(rng() * 3);
  const hw = 16 + Math.floor(rng() * 5);
  const hh = 30 + Math.floor(rng() * 5);

  const skin = 5 + ((traits.typeId + Math.floor(rng() * 3)) % 3);
  const shade = Math.min(15, skin + 3);
  const light = Math.max(1, skin - 2);

  for (let y = 0; y < hh; y++) {
    const taperTop = y < 4 ? 4 - y : 0;
    const taperBottom = y > hh - 5 ? y - (hh - 5) : 0;
    const halfW = hw - taperTop - taperBottom;
    for (let dx = -halfW; dx <= halfW; dx++) {
      let c = skin;
      if (dx < -halfW + 3) c = shade;
      else if (dx > halfW - 2) c = light;
      set(cx + dx, top + y, c);
    }
  }

  if (traits.typeId === 1) {
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(cx - hw + 1, top - 5 + i, 6 - i, 1, shade);
      ctx.fillRect(cx + hw - 6 + i, top - 5 + i, 6 - i, 1, shade);
    }
  } else if (traits.typeId === 2) {
    ctx.fillRect(cx - 1, top - 9, 2, 9, 10);
    set(cx, top - 10, 13);
  } else if (traits.typeId === 3) {
    ctx.fillRect(cx - hw - 1, top + 6, 2, 18, 8);
    ctx.fillRect(cx + hw, top + 6, 2, 18, 8);
  } else if (traits.typeId === 4) {
    for (let y = 0; y < hh; y += 2) {
      set(cx - hw - 1, top + y, 11);
      set(cx + hw + 1, top + y, 11);
    }
  }

  return { cx, top, hw, hh };
}

function drawEyes(ctx: DrawCtx, rng: () => number, traits: Traits, geom: { cx: number; top: number; hh: number }): void {
  const eyeY = geom.top + Math.floor(geom.hh * 0.42);
  const eyeDx = 7 + Math.floor(rng() * 3);
  const eyeW = traits.expressionId === 4 ? 4 : 3;
  const eyeH = traits.expressionId === 5 ? 1 : traits.expressionId === 4 ? 4 : 2;
  const iris = 12 + Math.floor(rng() * 4);

  const drawEye = (x: number) => {
    ctx.fillRect(x - eyeW, eyeY, eyeW * 2, eyeH, 1);
    ctx.set(x - 1, eyeY, iris);
    ctx.set(x, eyeY, iris);
  };
  drawEye(geom.cx - eyeDx);
  drawEye(geom.cx + eyeDx);

  if (traits.eyewearId === 1) {
    ctx.fillRect(geom.cx - eyeDx - eyeW - 1, eyeY - 1, (eyeDx + eyeW + 1) * 2, eyeH + 2, 1);
  } else if (traits.eyewearId === 2) {
    ctx.drawCircle(geom.cx - eyeDx, eyeY + 1, 3, 1);
    ctx.drawCircle(geom.cx + eyeDx, eyeY + 1, 3, 1);
    ctx.fillRect(geom.cx - 1, eyeY + 1, 2, 1, 1);
  } else if (traits.eyewearId === 3) {
    ctx.fillRect(geom.cx - eyeDx - eyeW - 2, eyeY - 1, (eyeDx + eyeW + 2) * 2, 3, 10);
  } else if (traits.eyewearId === 4) {
    ctx.fillRect(geom.cx - eyeDx - eyeW - 1, eyeY - 1, eyeW * 2 + 2, eyeH + 2, 1);
  } else if (traits.eyewearId === 5) {
    ctx.fillRect(geom.cx - eyeDx - eyeW - 2, eyeY - 2, (eyeDx + eyeW + 2) * 2, eyeH + 4, 10);
    ctx.fillRect(geom.cx - eyeDx - eyeW - 1, eyeY - 1, (eyeDx + eyeW + 1) * 2, eyeH + 2, 1);
  }
}

function drawMouth(ctx: DrawCtx, traits: Traits, geom: { cx: number; top: number; hh: number }): void {
  const y = geom.top + Math.floor(geom.hh * 0.74);
  const feature = 13;
  if (traits.expressionId === 1) {
    for (let i = -4; i <= 4; i++) ctx.set(geom.cx + i, y + Math.round(Math.abs(i) * 0.4), feature);
  } else if (traits.expressionId === 2) {
    ctx.fillRect(geom.cx - 4, y, 9, 1, 8);
  } else if (traits.expressionId === 3) {
    for (let i = -4; i <= 2; i++) ctx.set(geom.cx + i, y - Math.round((i + 4) * 0.25), 1);
  } else if (traits.expressionId === 4) {
    ctx.fillRect(geom.cx - 2, y - 1, 4, 4, 1);
  } else if (traits.expressionId === 5) {
    ctx.fillRect(geom.cx - 4, y, 8, 1, 8);
  } else {
    ctx.fillRect(geom.cx - 3, y, 7, 1, 8);
  }
}

function drawHeadgear(ctx: DrawCtx, traits: Traits, geom: { cx: number; top: number; hw: number }): void {
  const g = traits.headgearId;
  const gear = 10;
  if (g === 1) {
    ctx.fillRect(geom.cx - geom.hw, geom.top - 2, geom.hw * 2, 5, gear);
    ctx.fillRect(geom.cx - geom.hw - 4, geom.top + 2, 6, 2, gear);
  } else if (g === 2) {
    for (let i = 0; i < 5; i++) ctx.fillRect(geom.cx - 12 + i * 6, geom.top - 6 + (i % 2) * 3, 4, 6, 13);
    ctx.fillRect(geom.cx - 14, geom.top - 1, 28, 3, 13);
  } else if (g === 3) {
    for (let i = -10; i <= 10; i++) ctx.set(geom.cx + i, geom.top - 7, 11);
  } else if (g === 4) {
    ctx.fillRect(geom.cx - 1, geom.top - 9, 2, 9, gear);
    ctx.set(geom.cx, geom.top - 10, 13);
  } else if (g === 5) {
    ctx.fillRect(geom.cx - 10, geom.top - 14, 20, 12, 1);
    ctx.fillRect(geom.cx - 15, geom.top - 3, 30, 3, 1);
  } else if (g === 6) {
    ctx.fillRect(geom.cx - geom.hw - 1, geom.top - 1, geom.hw * 2 + 2, 3, gear);
  } else if (g === 7) {
    ctx.fillRect(geom.cx - geom.hw, geom.top - 4, geom.hw * 2, 7, gear);
  }
}

function pack4bpp(buf: Uint8Array): Uint8Array {
  if (buf.length !== PIXELS) throw new Error("Invalid index buffer length.");
  const out = new Uint8Array(PACKED_BUFFER_BYTES);
  for (let i = 0; i < PACKED_BUFFER_BYTES; i++) {
    const hi = buf[i * 2] ?? 0;
    const lo = buf[i * 2 + 1] ?? 0;
    out[i] = ((hi & 0x0f) << 4) | (lo & 0x0f);
  }
  return out;
}

function toHex(data: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(data).toString("hex")}`;
}

export function generateToken(tokenId: number): GeneratedToken {
  const rng = mulberry32((Math.imul(tokenId, 2654435761) + 12345) >>> 0);
  const traits = buildTraits(tokenId, rng);
  const ctx = createContext();

  const geom = drawBaseHead(ctx, rng, traits);
  drawEyes(ctx, rng, traits, geom);
  drawMouth(ctx, traits, geom);
  drawHeadgear(ctx, traits, geom);

  const traitBytes = Uint8Array.from([
    traits.typeId,
    traits.expressionId,
    traits.headgearId,
    traits.eyewearId,
    traits.paletteId,
  ]);
  const packed = pack4bpp(ctx.buf);

  return {
    tokenId,
    traits,
    traitBytesHex: toHex(traitBytes),
    indexBuffer: ctx.buf,
    packedBufferHex: toHex(packed),
  };
}
