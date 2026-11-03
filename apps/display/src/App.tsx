import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';
import {
  characters,
  defaultDisplaySettings,
  type DisplaySettings,
  type Submission,
} from '@mansour/shared';
import { findBestPlacement, type Placed } from './placement';
import {
  DEFAULT_MOSAIC_CONFIG,
  buildFillOrder,
  fillCountForPercentage,
  loadImage,
  participationPercentage,
  rowsForAspectRatio,
  sampleTarget,
} from './mosaicEngine';
import { createImageMask, createTextMask, packMask, type MaskMode, type TileMode } from './silhouetteEngine';

type WallNote = Submission & Placed & { color: string };

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
const stickyPalette = ['#f1e6b2', '#77c5d5', '#d9e7e2', '#f4b4c1', '#ffffff'];
const samples = [
  'Family is where every story begins.',
  'البيت هو المكان الذي يجمع قلوبنا',
  'Together, ordinary moments become our best memories.',
  'أمي هي الأمان في كل يوم',
  "Grandpa's stories keep our roots alive.",
  'Support is believing in each other.',
  'العائلة حب لا ينتهي',
  'Home is a feeling we create together.',
  'Our happiest adventures always start at home.',
  'الضحكة الحلوة تجمع كل العائلة',
  'My family gives me courage to try new things.',
  'مع عائلتي كل لحظة تصبح ذكرى جميلة',
  'Kindness is the language every family understands.',
  'جدي وجدتي هما بركة البيت',
  'We grow stronger when we help one another.',
  'أجمل مكان هو المكان الذي نكون فيه معاً',
  'Every family tradition tells a story.',
  'إخوتي هم أصدقائي في كل مغامرة',
  'Love makes ordinary days feel special.',
  'عائلتي مصدر قوتي وإلهامي',
  'The best memories are made together.',
  'بيتنا مليء بالحب والضحكات',
  'Family means never facing a challenge alone.',
  'نكتشف العالم معاً ونعود دائماً إلى البيت',
];

function makeSample(i: number): Submission {
  const message = samples[i % samples.length];
  return {
    _id: `sample-${i}`,
    stickyNumber: 1800 + i,
    rawMessage: message,
    generatedMessage: message,
    finalMessage: message,
    language: /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en',
    character: characters[i % characters.length].id,
    promptId: 'family-meaning',
    status: 'approved',
    createdAt: new Date().toISOString(),
    aiGenerationCount: 1,
    userEdited: false,
    displayPriority: 0,
    isFeatured: false,
  };
}

function image(character: string) {
  return `/characters/${character}.png`;
}

function hash(value: string) {
  return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

export default function App() {
  const [notes, setNotes] = useState<WallNote[]>([]);
  const [hero, setHero] = useState<Submission | null>(null);
  const [featured, setFeatured] = useState<Submission | null>(null);
  const [settings, setSettings] = useState<DisplaySettings>(defaultDisplaySettings);
  const [connected, setConnected] = useState(false);
  const [mosaicActive, setMosaicActive] = useState(() => new URLSearchParams(location.search).get('mosaic') === '1');
  const placed = useRef<Placed[]>([]);
  const lastSync = useRef(new Date(Date.now() - 86400000).toISOString());

  function place(submission: Submission) {
    // Calibrated for the event's ultra-wide 7896 x 1344 LED canvas, while
    // retaining usable minimums in a normal preview window.
    const width = Math.max(250, innerWidth * 0.038);
    const height = Math.max(150, innerHeight * 0.145);
    const position = findBestPlacement(
      placed.current,
      { width, height },
      { width: innerWidth, height: innerHeight },
    );
    placed.current = [...placed.current.slice(-settings.maxActiveNotes + 1), position];
    const color = stickyPalette[hash(submission._id) % stickyPalette.length];
    setNotes((current) => [
      ...current.slice(-settings.maxActiveNotes + 1),
      { ...submission, ...position, color },
    ]);
    lastSync.current = submission.approvedAt || submission.createdAt;
  }

  function arrive(submission: Submission) {
    if (settings.pausedIncoming) return;
    setHero(submission);
    setTimeout(() => {
      setHero((current) => (current?._id === submission._id ? null : current));
      place(submission);
    }, settings.heroDuration);
  }

  useEffect(() => {
    const previewCount = Math.min(innerWidth / innerHeight > 4 ? 120 : 42, settings.maxActiveNotes);
    Array.from({ length: previewCount }, (_, index) => makeSample(index)).forEach(place);

    fetch(`${API}/display/sync?after=${encodeURIComponent(lastSync.current)}`)
      .then((response) => response.json())
      .then((data) => (data.submissions || []).forEach(place))
      .catch(() => {});

    const socket = io(SOCKET, { reconnection: true, reconnectionDelayMax: 5000 });
    socket.on('connect', () => {
      setConnected(true);
      fetch(`${API}/display/sync?after=${encodeURIComponent(lastSync.current)}`)
        .then((response) => response.json())
        .then((data) => (data.submissions || []).forEach(arrive))
        .catch(() => {});
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('sticky:new', arrive);
    socket.on('sticky:feature', (submission: Submission) => {
      setFeatured(submission);
      setTimeout(() => setFeatured(null), settings.featuredDuration);
    });
    socket.on('sticky:remove', ({ id }: { id: string }) => {
      setNotes((current) => current.filter((note) => note._id !== id));
    });
    socket.on('display:settings', (next: DisplaySettings) => setSettings(next));
    socket.on('display:mosaic', ({ active }: { active: boolean }) => setMosaicActive(Boolean(active)));
    socket.on('display:clearHero', () => {
      setHero(null);
      setFeatured(null);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  if (new URLSearchParams(location.search).get('mosaicPreview') === '1') {
    return <MosaicDevelopmentPreview />;
  }

  return (
    <main className={mosaicActive ? 'wall mosaic-mode' : 'wall'}>
      <div className="brand-ribbon" aria-hidden="true" />
      <div className="topline">
        <div className="wordmark">MANSOUR</div>
        <div className="title-lockup">
          <strong>AI LIVING WALL</strong>
          <small>EVERY FAMILY HAS A STORY</small>
        </div>
      </div>
      <div className={connected ? 'connection online' : 'connection'}>
        {connected ? 'LIVE' : 'LOCAL PREVIEW'}
      </div>

      <div className="character-stage" aria-hidden="true">
        {characters.map((character, index) => (
          <motion.img
            key={character.id}
            className={`stage-character stage-character-${index + 1}`}
            src={image(character.id)}
            alt=""
            animate={{ y: [0, -12 - (index % 3) * 5, 0], rotate: [0, index % 2 ? 1.2 : -1.2, 0] }}
            transition={{ duration: 6 + index * 0.55, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {mosaicActive ? (
          <motion.div className="mosaic-layer" key="mosaic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MosaicCanvas notes={notes} targetImage="/mosaic-target.svg" percentageOverride={100} animate={false} columns={144} rows={24} nativeResolution />
          </motion.div>
        ) : (
          <motion.div className="wall-layer" key="wall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {notes.slice(-settings.maxActiveNotes).map((note, index) => (
              <Sticky
                key={note._id}
                note={note}
                memory={index < Math.max(0, notes.length - 72)}
                paused={settings.pausedAnimation}
                speed={settings.animationSpeed}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(hero || featured) && (
          <div className="focus-backdrop">
            <motion.div
              className={`hero-sticky ${featured ? 'featured' : ''}`}
              initial={{ scale: 0.35, rotate: -9, opacity: 0, y: 100 }}
              animate={{ scale: 1, rotate: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.55, opacity: 0 }}
              transition={{ type: 'spring', damping: 18 }}
            >
              <span className="tape" />
              <blockquote dir={(hero || featured)!.language === 'ar' ? 'rtl' : 'ltr'}>
                {(hero || featured)!.finalMessage}
              </blockquote>
              <div className="hero-character">
                <img src={image((hero || featured)!.character)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                <b>{characters.find((item) => item.id === (hero || featured)!.character)?.nameEn}</b>
              </div>
              <small>#{String((hero || featured)!.stickyNumber).padStart(5, '0')}</small>
              {featured && <em>FEATURED MESSAGE</em>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer>
        <div><i /> LIVE AT AL MANSOUR FESTIVAL</div>
        <strong>{notes.length.toLocaleString()} STORIES &amp; COUNTING</strong>
      </footer>
    </main>
  );
}

function PackedMosaicCanvas({
  notes,
  percentage,
  maskMode = 'image',
  maskText = '',
  maskSource = '/mosaic-target.svg',
  tileMode = 'sticky',
  cardCount = 600,
  minSize = 18,
  maxSize = 38,
  rotation = 4,
  overlap = .12,
  density = 1,
  maskOnly = false,
}: {
  notes: Submission[];
  percentage?: number;
  maskMode?: MaskMode;
  maskText?: string;
  maskSource?: string;
  tileMode?: TileMode;
  cardCount?: number;
  minSize?: number;
  maxSize?: number;
  rotation?: number;
  overlap?: number;
  density?: number;
  maskOnly?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const previousCount = useRef(notes.length);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = 1974;
    const height = 336;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    let cancelled = false;
    let frame = 0;
    const previous = previousCount.current;
    previousCount.current = notes.length;
    const makeMask = async () => maskMode === 'text'
      ? createTextMask(width, height, maskText)
      : createImageMask(width, height, await loadImage(maskSource));
    Promise.all([
      makeMask(),
      maskMode === 'text' ? Promise.resolve(null) : loadImage(maskSource),
      ...characters.map((character) => loadImage(image(character.id)).catch(() => null)),
    ]).then(([mask, targetArtwork, ...characterImages]) => {
      if (cancelled) return;
      if (maskOnly) {
        context.fillStyle = '#071f29';
        context.fillRect(0, 0, width, height);
        context.globalAlpha = .92;
        context.drawImage(mask as HTMLCanvasElement, 0, 0);
        return;
      }
      const positions = packMask(mask as HTMLCanvasElement, { cardCount, minSize, maxSize, rotation, overlap, density });
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = width;
      targetCanvas.height = height;
      const targetContext = targetCanvas.getContext('2d', { willReadFrequently: true });
      if (targetArtwork && targetContext) {
        const sourceAspect = targetArtwork.naturalWidth / targetArtwork.naturalHeight;
        const targetAspect = width / height;
        let sx = 0, sy = 0, sw = targetArtwork.naturalWidth, sh = targetArtwork.naturalHeight;
        if (sourceAspect > targetAspect) { sw = sh * targetAspect; sx = (targetArtwork.naturalWidth - sw) / 2; }
        else if (sourceAspect < targetAspect) { sh = sw / targetAspect; sy = (targetArtwork.naturalHeight - sh) / 2; }
        targetContext.drawImage(targetArtwork, sx, sy, sw, sh, 0, 0, width, height);
      }
      const sampledColors = targetArtwork && targetContext
        ? positions.map((tile) => {
            const pixel = targetContext.getImageData(Math.max(0, Math.min(width - 1, Math.round(tile.x + tile.width / 2))), Math.max(0, Math.min(height - 1, Math.round(tile.y + tile.height / 2))), 1, 1).data;
            return `rgb(${pixel[0]} ${pixel[1]} ${pixel[2]})`;
          })
        : [];
      const filled = percentage === undefined
        ? Math.min(notes.length, positions.length)
        : fillCountForPercentage(positions.length, percentage);
      const previousFilled = percentage === undefined ? Math.min(previous, filled) : filled;
      const start = performance.now();
      const duration = 850;
      const palette = ['#f1e6b2', '#77c5d5', '#d9e7e2', '#f4b4c1', '#ffffff', '#ba0c2f'];
      const rounded = (x: number, y: number, w: number, h: number, radius: number) => {
        context.beginPath(); context.roundRect(x, y, w, h, radius); context.fill();
      };
      const draw = (now: number) => {
        if (cancelled) return;
        const gradient = context.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width * .58);
        gradient.addColorStop(0, '#124650');
        gradient.addColorStop(1, '#061c25');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        let complete = true;
        for (let index = 0; index < filled; index += 1) {
          const tile = positions[index];
          const note = notes.length ? notes[index % notes.length] : makeSample(index);
          const isNew = index >= previousFilled;
          const raw = isNew ? Math.max(0, Math.min(1, (now - start - (index - previousFilled) * 22) / duration)) : 1;
          const progress = 1 - Math.pow(1 - raw, 3);
          if (raw < 1) complete = false;
          const targetX = tile.x + tile.width / 2;
          const targetY = tile.y + tile.height / 2;
          const x = width / 2 + (targetX - width / 2) * progress;
          const y = height * .45 + (targetY - height * .45) * progress;
          const scale = .45 + progress * .55;
          const mode = tileMode === 'hybrid' ? (index % 3 === 0 ? 'photo' : 'sticky') : tileMode;
          context.save();
          context.translate(x, y);
          context.rotate(tile.rotation * progress * Math.PI / 180);
          context.scale(scale, scale);
          context.shadowColor = '#00121970';
          context.shadowBlur = 3;
          context.shadowOffsetY = 1.4;
          if (mode === 'photo') {
            context.fillStyle = '#ffffff';
            rounded(-tile.width / 2, -tile.height / 2, tile.width, tile.height, 2.4);
            const characterIndex = characters.findIndex((character) => character.id === note.character);
            const portrait = characterImages[characterIndex];
            context.shadowColor = 'transparent';
            if (portrait) context.drawImage(portrait, -tile.width * .34, -tile.height * .42, tile.width * .68, tile.height * .68);
            context.fillStyle = '#173d43';
            context.font = `700 ${Math.max(2.2, tile.height * .1)}px "Baloo 2", sans-serif`;
            context.textAlign = 'center';
            context.fillText(`#${String(note.stickyNumber).padStart(5, '0')}`, 0, tile.height * .38, tile.width * .82);
          } else {
            let color = palette[hash(note._id) % palette.length];
            if (sampledColors[index]) color = sampledColors[index];
            context.fillStyle = color;
            rounded(-tile.width / 2, -tile.height / 2, tile.width, tile.height, 2.2);
            context.shadowColor = 'transparent';
            const match = color.match(/\d+/g)?.map(Number);
            const dark = match ? (match[0] * .2126 + match[1] * .7152 + match[2] * .0722) < 122 : color === '#ba0c2f';
            context.fillStyle = dark ? '#fff' : '#07272d';
            context.globalAlpha = .82;
            context.font = `700 ${Math.max(2.1, tile.height * .1)}px "Baloo 2", "Noto Kufi Arabic", sans-serif`;
            context.textAlign = note.language === 'ar' ? 'right' : 'left';
            context.textBaseline = 'top';
            const copy = note.finalMessage.length > 24 ? `${note.finalMessage.slice(0, 23)}…` : note.finalMessage;
            context.fillText(copy, note.language === 'ar' ? tile.width * .28 : -tile.width * .42, -tile.height * .34, tile.width * .62);
            const characterIndex = characters.findIndex((character) => character.id === note.character);
            const characterImage = characterImages[characterIndex];
            if (characterImage) context.drawImage(characterImage, tile.width * .2, tile.height * .05, tile.width * .22, tile.height * .36);
          }
          context.restore();
        }
        if (!complete) frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    }).catch(() => {});
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [cardCount, density, maskMode, maskOnly, maskSource, maskText, maxSize, minSize, notes.length, overlap, percentage, rotation, tileMode]);
  return <canvas ref={ref} className="mosaic-canvas" aria-label="Packed silhouette mosaic" />;
}

function MosaicCanvas({
  notes,
  targetImage = DEFAULT_MOSAIC_CONFIG.targetImage,
  percentageOverride,
  animate = false,
  columns = DEFAULT_MOSAIC_CONFIG.columns,
  rows = DEFAULT_MOSAIC_CONFIG.rows,
  showGrid = false,
  showCoordinates = false,
  targetOpacity = 0,
  nativeResolution = false,
}: {
  notes: Submission[];
  targetImage?: string;
  percentageOverride?: number;
  animate?: boolean;
  columns?: number;
  rows?: number;
  showGrid?: boolean;
  showCoordinates?: boolean;
  targetOpacity?: number;
  nativeResolution?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = nativeResolution ? 7896 : 1974;
    const height = nativeResolution ? 1344 : 336;
    const renderScale = width / 1974;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    let frame = 0;
    let cancelled = false;
    Promise.all([
      loadImage(targetImage),
      ...characters.map((character) => loadImage(image(character.id)).catch(() => null)),
    ]).then(([artwork, ...characterImages]) => {
      if (cancelled) return;
      const cells = sampleTarget(artwork!, columns, rows);
      const order = buildFillOrder(columns, rows);
      const total = cells.length;
      const filled = percentageOverride === undefined
        ? Math.min(notes.length, total)
        : fillCountForPercentage(total, percentageOverride);
      const assignmentByCell = new Map(order.slice(0, filled).map((cellIndex, assignment) => [cellIndex, assignment]));
      const start = performance.now();
      const tileWidth = width / columns;
      const tileHeight = height / rows;
      // Render the vector once into the exact LED coordinate space. Cropping
      // the raw SVG image directly is unreliable because SVG intrinsic sizing
      // differs between browsers when only a viewBox is present.
      const artworkRaster = document.createElement('canvas');
      artworkRaster.width = width;
      artworkRaster.height = height;
      const artworkContext = artworkRaster.getContext('2d');
      if (!artworkContext) return;
      artworkContext.drawImage(artwork!, 0, 0, width, height);
      const duration = animate ? 1850 : 1;
      const ease = (value: number) => 1 - Math.pow(1 - value, 4);
      const draw = (now: number) => {
        if (cancelled) return;
        context.fillStyle = '#eaf2f1';
        context.fillRect(0, 0, width, height);
        let complete = true;
        for (let cellIndex = 0; cellIndex < total; cellIndex += 1) {
          const cell = cells[cellIndex];
          const targetX = cell.column * tileWidth;
          const targetY = cell.row * tileHeight;
          const assignment = assignmentByCell.get(cellIndex);
          const gap = .12 * renderScale;
          const baseWidth = tileWidth - gap * 2;
          const baseHeight = tileHeight - gap * 2;
          if (assignment === undefined) {
            context.save();
            context.globalAlpha = .12;
            context.fillStyle = cell.cssColor;
            context.fillRect(targetX + gap, targetY + gap, baseWidth, baseHeight);
            if (showCoordinates) {
              context.globalAlpha = .4;
              context.fillStyle = cell.textColor;
              context.font = `500 ${2 * renderScale}px monospace`;
              context.fillText(`${cell.column},${cell.row}`, targetX + 1.2, targetY + 1.2);
            }
            context.restore();
            continue;
          }
          const note = notes.length ? notes[assignment % notes.length] : makeSample(assignment);
          const startX = animate && 'x' in note ? ((note as WallNote).x / innerWidth) * width : width / 2;
          const startY = animate && 'y' in note ? ((note as WallNote).y / innerHeight) * height : height / 2;
          const delay = animate ? (assignment % 48) * 2.2 : 0;
          const raw = Math.max(0, Math.min(1, (now - start - delay) / duration));
          const progress = ease(raw);
          if (raw < 1) complete = false;
          const x = startX + (targetX - startX) * progress;
          const y = startY + (targetY - startY) * progress;
          const scale = 1.14 - progress * .14;
          const drawWidth = tileWidth * scale - gap * 2;
          const drawHeight = tileHeight * scale - gap * 2;
          context.save();
          context.translate(x + tileWidth / 2, y + tileHeight / 2);
          context.rotate(((('rotation' in note ? (note as WallNote).rotation : 0)) * (1 - progress) * Math.PI) / 180);
          context.drawImage(
            artworkRaster,
            cell.column * tileWidth,
            cell.row * tileHeight,
            tileWidth,
            tileHeight,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight,
          );
          context.strokeStyle = cell.textColor === '#ffffff' ? '#ffffff55' : '#07272d38';
          context.lineWidth = Math.max(.35, renderScale * .28);
          context.strokeRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          context.fillStyle = cell.textColor;
          context.globalAlpha = .3;
          context.font = `700 ${3.1 * renderScale}px "Baloo 2", "Noto Kufi Arabic", sans-serif`;
          context.textAlign = note.language === 'ar' ? 'right' : 'left';
          context.textBaseline = 'top';
          const copy = note.finalMessage.length > 34 ? `${note.finalMessage.slice(0, 33)}…` : note.finalMessage;
          context.fillText(copy, note.language === 'ar' ? drawWidth * .26 : -drawWidth * .45, -drawHeight * .35, drawWidth * .68);
          const characterIndex = characters.findIndex((character) => character.id === note.character);
          const characterImage = characterImages[characterIndex];
          if (characterImage) {
            context.globalAlpha = .24;
            context.drawImage(characterImage, drawWidth * .29, drawHeight * .15, drawWidth * .16, drawHeight * .3);
          }
          context.globalAlpha = .24;
          context.font = `700 ${2.1 * renderScale}px "Baloo 2", sans-serif`;
          context.textAlign = 'left';
          context.fillText(`#${String(note.stickyNumber).padStart(5, '0')}`, -drawWidth * .45, drawHeight * .34);
          if (showCoordinates) {
            context.globalAlpha = .7;
            context.fillStyle = cell.textColor;
            context.font = `500 ${2 * renderScale}px monospace`;
            context.fillText(`${cell.column},${cell.row}`, -drawWidth * .45, -drawHeight * .47);
          }
          context.restore();
        }
        if (showGrid) {
          context.save();
          context.strokeStyle = '#ffffff80';
          context.lineWidth = .22 * renderScale;
          for (let column = 1; column < columns; column += 1) {
            context.beginPath(); context.moveTo(column * tileWidth, 0); context.lineTo(column * tileWidth, height); context.stroke();
          }
          for (let row = 1; row < rows; row += 1) {
            context.beginPath(); context.moveTo(0, row * tileHeight); context.lineTo(width, row * tileHeight); context.stroke();
          }
          context.restore();
        }
        if (targetOpacity > 0) {
          const sourceAspect = artwork!.naturalWidth / artwork!.naturalHeight;
          const targetAspect = width / height;
          let sx = 0, sy = 0, sw = artwork!.naturalWidth, sh = artwork!.naturalHeight;
          if (sourceAspect > targetAspect) { sw = sh * targetAspect; sx = (artwork!.naturalWidth - sw) / 2; }
          else if (sourceAspect < targetAspect) { sh = sw / targetAspect; sy = (artwork!.naturalHeight - sh) / 2; }
          context.save();
          context.globalAlpha = targetOpacity / 100;
          context.drawImage(artwork!, sx, sy, sw, sh, 0, 0, width, height);
          context.restore();
        }
        if (!complete) frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    }).catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [animate, columns, nativeResolution, notes.length, percentageOverride, rows, showCoordinates, showGrid, targetImage, targetOpacity]);
  return <canvas ref={canvasRef} className="mosaic-canvas" aria-label="Live sticky mosaic" />;
}

function SilhouetteDevelopmentPreview() {
  const [progress, setProgress] = useState(50);
  const [maskMode, setMaskMode] = useState<MaskMode>('image');
  const [maskText, setMaskText] = useState('');
  const [maskSource, setMaskSource] = useState('/mosaic-target.svg');
  const [tileMode, setTileMode] = useState<TileMode>('sticky');
  const [cardCount, setCardCount] = useState(600);
  const [minSize, setMinSize] = useState(18);
  const [maxSize, setMaxSize] = useState(38);
  const [rotation, setRotation] = useState(4);
  const [overlap, setOverlap] = useState(12);
  const [density, setDensity] = useState(100);
  const previewNotes = useMemo(() => Array.from({ length: 1200 }, (_, index) => makeSample(index)), []);
  function upload(file?: File) {
    if (!file) return;
    const source = URL.createObjectURL(file);
    setMaskSource((current) => { if (current.startsWith('blob:')) URL.revokeObjectURL(current); return source; });
    setMaskMode(file.type.includes('svg') ? 'svg' : 'image');
  }
  const shared = { maskMode, maskText, maskSource, cardCount, minSize, maxSize, rotation, overlap: overlap / 100, density: density / 100 };
  return <main className="mosaic-preview-page silhouette-preview">
    <header><div><small>MASK PACKING DEBUG</small><h1>Packed Silhouette Mosaic</h1><p>{cardCount} tightly packed cards · {progress}% reveal · Canvas renderer</p></div><label>Upload SVG / mask image<input type="file" accept="image/*,.svg" onChange={(event)=>upload(event.target.files?.[0])}/></label></header>
    <section className="silhouette-config">
      <label>Shape type<select value={maskMode} onChange={(event)=>setMaskMode(event.target.value as MaskMode)}><option value="text">Text / wordmark</option><option value="svg">SVG mask</option><option value="image">Image mask</option></select></label>
      {maskMode==='text'&&<label>Shape text<input value={maskText} onChange={(event)=>setMaskText(event.target.value)}/></label>}
      <label>Tile type<select value={tileMode} onChange={(event)=>setTileMode(event.target.value as TileMode)}><option value="sticky">Message sticky</option><option value="photo">Photo card</option><option value="hybrid">Hybrid</option></select></label>
      <label>Card count <b>{cardCount}</b><input type="range" min="100" max="1200" step="25" value={cardCount} onChange={(event)=>setCardCount(Number(event.target.value))}/></label>
      <label>Tile size <b>{minSize}–{maxSize}</b><span><input type="range" min="10" max="35" value={minSize} onChange={(event)=>setMinSize(Math.min(Number(event.target.value),maxSize-2))}/><input type="range" min="22" max="60" value={maxSize} onChange={(event)=>setMaxSize(Math.max(Number(event.target.value),minSize+2))}/></span></label>
      <label>Rotation <b>±{rotation}°</b><input type="range" min="0" max="12" value={rotation} onChange={(event)=>setRotation(Number(event.target.value))}/></label>
      <label>Overlap <b>{overlap}%</b><input type="range" min="0" max="40" value={overlap} onChange={(event)=>setOverlap(Number(event.target.value))}/></label>
      <label>Density <b>{density}%</b><input type="range" min="60" max="145" value={density} onChange={(event)=>setDensity(Number(event.target.value))}/></label>
    </section>
    <section className="preview-panes"><article><h2>Target mask</h2><div><PackedMosaicCanvas notes={previewNotes} {...shared} maskOnly/></div></article><article><h2>Generated packed mosaic</h2><div><PackedMosaicCanvas notes={previewNotes} {...shared} tileMode={tileMode} percentage={progress}/></div></article></section>
    <section className="preview-controls"><div>{[0,10,25,50,75,100].map(value=><button key={value} className={progress===value?'active':''} onClick={()=>setProgress(value)}>{value}%</button>)}</div><input aria-label="Reveal percentage" type="range" min="0" max="100" value={progress} onChange={(event)=>setProgress(Number(event.target.value))}/><strong>{progress}%</strong></section>
  </main>;
}

function MosaicDevelopmentPreview() {
  const [percentage, setPercentage] = useState(50);
  const [targetImage, setTargetImage] = useState(DEFAULT_MOSAIC_CONFIG.targetImage);
  const [showGrid, setShowGrid] = useState(false);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [targetOpacity, setTargetOpacity] = useState(0);
  const columns = 60;
  const rows = rowsForAspectRatio(columns);
  const previewNotes = useMemo(() => Array.from({ length: columns * rows }, (_, index) => makeSample(index)), [columns, rows]);
  function upload(file?: File) {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setTargetImage((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return next;
    });
  }
  const total = columns * rows;
  const filled = fillCountForPercentage(total, percentage);
  return <main className="mosaic-preview-page">
    <header><div><small>DEVELOPMENT PREVIEW</small><h1>Mansour Sticky Mosaic</h1><p>360° canvas · {columns} columns × {rows} rows · {filled.toLocaleString()} / {total.toLocaleString()} filled</p></div><label>Change approved artwork<input type="file" accept="image/*,.svg" onChange={(event)=>upload(event.target.files?.[0])}/></label></header>
    <section className="preview-panes"><article><h2>Original target</h2><div><img src={targetImage} alt="Approved Mansour artwork"/></div></article><article><h2>Mosaic output · {participationPercentage(filled,total).toFixed(0)}%</h2><div><MosaicCanvas notes={previewNotes} targetImage={targetImage} percentageOverride={percentage} animate={false} columns={columns} rows={rows} showGrid={showGrid} showCoordinates={showCoordinates} targetOpacity={targetOpacity}/></div></article></section>
    <section className="preview-controls"><div>{[10,25,50,75,100].map(value=><button key={value} className={percentage===value?'active':''} onClick={()=>setPercentage(value)}>{value}%</button>)}</div><input aria-label="Mosaic fill percentage" type="range" min="0" max="100" value={percentage} onChange={(event)=>setPercentage(Number(event.target.value))}/><strong>{percentage}%</strong></section>
    <section className="debug-controls"><label><input type="checkbox" checked={showGrid} onChange={(event)=>setShowGrid(event.target.checked)}/> Show grid</label><label><input type="checkbox" checked={showCoordinates} onChange={(event)=>setShowCoordinates(event.target.checked)}/> Show cell coordinates</label><label className="overlay-control"><span>Target image overlay</span><input type="range" min="0" max="100" value={targetOpacity} onChange={(event)=>setTargetOpacity(Number(event.target.value))}/><strong>{targetOpacity}%</strong></label></section>
  </main>;
}

function Sticky({
  note,
  memory,
  paused,
  speed,
}: {
  note: WallNote;
  memory: boolean;
  paused: boolean;
  speed: number;
}) {
  const character = characters.find((item) => item.id === note.character) || characters[0];
  const movement = useMemo(() => {
    const seed = hash(note._id);
    const direction = seed % 2 ? 1 : -1;
    const x = direction * (90 + (seed % 190));
    const y = (direction * -1) * (28 + ((seed >>> 4) % 82));
    const duration = (22 + ((seed >>> 8) % 20)) / Math.max(0.45, speed);
    return { x, y, duration, delay: -((seed >>> 12) % 20) };
  }, [note._id, speed]);

  return (
    <motion.article
      className={memory ? 'sticky memory' : 'sticky'}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: memory ? 0.34 : 1,
        scale: memory ? 0.68 : note.scale,
        x: paused ? 0 : [0, movement.x, movement.x * -0.35, 0],
        y: paused ? 0 : [0, movement.y, movement.y * -0.55, 0],
      }}
      transition={{
        opacity: { duration: 0.8 },
        scale: { duration: 0.8 },
        x: { duration: movement.duration, delay: movement.delay, repeat: Infinity, ease: 'easeInOut' },
        y: { duration: movement.duration * 0.83, delay: movement.delay, repeat: Infinity, ease: 'easeInOut' },
      }}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        rotate: note.rotation,
        background: note.color,
      }}
    >
      <span className="pin" aria-hidden="true" />
      <blockquote dir={note.language === 'ar' ? 'rtl' : 'ltr'}>{note.finalMessage}</blockquote>
      <img src={image(note.character)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      <small>#{String(note.stickyNumber).padStart(5, '0')}</small>
      <span className="character-name">{character.nameEn}</span>
    </motion.article>
  );
}
