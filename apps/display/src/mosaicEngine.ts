export type RGB = { r: number; g: number; b: number };
export type MosaicCell = {
  index: number;
  row: number;
  column: number;
  color: RGB;
  cssColor: string;
  textColor: '#ffffff' | '#07272d';
};

export type MosaicConfig = {
  columns: number;
  rows: number;
  targetImage: string;
};

export const DEFAULT_MOSAIC_CONFIG: MosaicConfig = {
  columns: 60,
  rows: 10,
  targetImage: '/mosaic-target.svg',
};

export const LED_ASPECT_RATIO = 7896 / 1344;

export function rowsForAspectRatio(columns: number, aspectRatio = LED_ASPECT_RATIO) {
  return Math.max(1, Math.round(columns / aspectRatio));
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

export function buildFillOrder(columns: number, rows: number): number[] {
  const total = columns * rows;
  // Golden-ratio ordering distributes early cells across the complete 360°
  // canvas instead of filling from left to right.
  const phi = 0.6180339887498949;
  return Array.from({ length: total }, (_, index) => index).sort((a, b) => {
    const ax = ((a * phi) % 1 + ((Math.floor(a * phi) * phi) % 1) / total) % 1;
    const bx = ((b * phi) % 1 + ((Math.floor(b * phi) * phi) % 1) / total) % 1;
    return ax - bx;
  });
}

export function sampleTarget(image: HTMLImageElement, columns: number, rows: number): MosaicCell[] {
  const sampleScale = 6;
  const canvas = document.createElement('canvas');
  canvas.width = columns * sampleScale;
  canvas.height = rows * sampleScale;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  const targetAspect = canvas.width / canvas.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (sourceAspect > targetAspect) {
    sourceWidth = image.naturalHeight * targetAspect;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (sourceAspect < targetAspect) {
    sourceHeight = image.naturalWidth / targetAspect;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const cells: MosaicCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let py = 0; py < sampleScale; py += 1) {
        for (let px = 0; px < sampleScale; px += 1) {
          const offset = (((row * sampleScale + py) * canvas.width) + column * sampleScale + px) * 4;
          const alpha = pixels[offset + 3] / 255;
          r += pixels[offset] * alpha + 241 * (1 - alpha);
          g += pixels[offset + 1] * alpha + 246 * (1 - alpha);
          b += pixels[offset + 2] * alpha + 246 * (1 - alpha);
          count += 1;
        }
      }
      const color = { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
      const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
      cells.push({
        index: row * columns + column,
        row,
        column,
        color,
        cssColor: `rgb(${color.r} ${color.g} ${color.b})`,
        textColor: luminance < .48 ? '#ffffff' : '#07272d',
      });
    }
  }
  return cells;
}

export function fillCountForPercentage(total: number, percentage: number) {
  return Math.max(0, Math.min(total, Math.round(total * percentage / 100)));
}

export function participationPercentage(filled: number, total: number) {
  return total ? Math.min(100, (filled / total) * 100) : 0;
}
