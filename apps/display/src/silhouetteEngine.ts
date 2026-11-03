export type MaskMode = 'text' | 'svg' | 'image';
export type TileMode = 'sticky' | 'photo' | 'hybrid';
export type PackedTile = { x: number; y: number; width: number; height: number; rotation: number; order: number };

function hash(value: number) {
  let x = value + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

export function createTextMask(width: number, height: number, text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let size = height * .78;
  do {
    context.font = `900 ${size}px "Baloo 2", "Noto Kufi Arabic", Arial Black, sans-serif`;
    if (context.measureText(text).width <= width * .88) break;
    size -= 4;
  } while (size > 20);
  context.fillText(text || 'MANSOUR', width / 2, height / 2 + size * .06);
  return canvas;
}

export function createImageMask(width: number, height: number, image: HTMLImageElement) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const context = source.getContext('2d', { willReadFrequently: true })!;
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  const targetAspect = width / height;
  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
  if (sourceAspect > targetAspect) { sw = sh * targetAspect; sx = (image.naturalWidth - sw) / 2; }
  else if (sourceAspect < targetAspect) { sh = sw / targetAspect; sy = (image.naturalHeight - sh) / 2; }
  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height);
  const cornerOffsets = [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4];
  const background = cornerOffsets.reduce((sum, offset) => [sum[0] + data.data[offset], sum[1] + data.data[offset + 1], sum[2] + data.data[offset + 2]], [0, 0, 0]).map(value => value / 4);
  for (let offset = 0; offset < data.data.length; offset += 4) {
    const alpha = data.data[offset + 3] / 255;
    const distance = Math.hypot(data.data[offset] - background[0], data.data[offset + 1] - background[1], data.data[offset + 2] - background[2]);
    const inside = alpha > .08 && (alpha < .98 || distance > 42);
    data.data[offset] = 255;
    data.data[offset + 1] = 255;
    data.data[offset + 2] = 255;
    data.data[offset + 3] = inside ? 255 : 0;
  }
  context.clearRect(0, 0, width, height);
  context.putImageData(data, 0, 0);
  return source;
}

export function packMask(mask: HTMLCanvasElement, options: {
  cardCount: number;
  minSize: number;
  maxSize: number;
  rotation: number;
  overlap: number;
  density: number;
}) {
  const { width, height } = mask;
  const context = mask.getContext('2d', { willReadFrequently: true })!;
  const pixels = context.getImageData(0, 0, width, height).data;
  let maskArea = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] > 127) maskArea += 1;
  const idealArea = Math.max(1, maskArea / Math.max(1, options.cardCount)) * Math.max(.55, options.density);
  const baseWidth = Math.max(options.minSize, Math.min(options.maxSize, Math.sqrt(idealArea * 1.28)));
  const baseHeight = baseWidth / 1.28;
  const stepX = Math.max(3, baseWidth * (1 - Math.min(.45, options.overlap)));
  const stepY = Math.max(3, baseHeight * (1 - Math.min(.45, options.overlap)));
  const inside = (x: number, y: number) => {
    const px = Math.max(0, Math.min(width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(height - 1, Math.round(y)));
    return pixels[(py * width + px) * 4 + 3] > 127;
  };
  const candidates: PackedTile[] = [];
  let seed = 0;
  for (let y = baseHeight / 2; y < height - baseHeight / 2; y += stepY) {
    for (let x = baseWidth / 2; x < width - baseWidth / 2; x += stepX) {
      const scale = .9 + hash(seed * 7 + 3) * .2;
      const tileWidth = baseWidth * scale;
      const tileHeight = baseHeight * scale;
      const jitterX = (hash(seed * 7 + 4) - .5) * stepX * .28;
      const jitterY = (hash(seed * 7 + 5) - .5) * stepY * .28;
      const cx = x + jitterX;
      const cy = y + jitterY;
      const insetX = tileWidth * .38;
      const insetY = tileHeight * .38;
      if (inside(cx, cy) && inside(cx - insetX, cy - insetY) && inside(cx + insetX, cy - insetY) && inside(cx - insetX, cy + insetY) && inside(cx + insetX, cy + insetY)) {
        candidates.push({
          x: cx - tileWidth / 2,
          y: cy - tileHeight / 2,
          width: tileWidth,
          height: tileHeight,
          rotation: (hash(seed * 7 + 6) * 2 - 1) * options.rotation,
          order: hash(seed * 7 + 7),
        });
      }
      seed += 1;
    }
  }
  candidates.sort((a, b) => a.order - b.order);
  return candidates.slice(0, options.cardCount);
}
