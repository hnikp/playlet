// Description: Generates the PNG key icons for the Persian (fa_IR) search keyboard.
// The Roku system font has no Persian glyphs, so every Persian key is an icon.
// Each letter is rendered with Vazirmatn and visually centered in a 48x48 canvas,
// as a white glyph (normal state) and a black glyph (focused state), both on a
// transparent background (same convention as images/icons/globe-white/black.png).
//
// Usage: npm run generate-persian-kb-icons

const { createConverter } = require('convert-svg-to-png');
const { mkdirSync, readFileSync, writeFileSync } = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const FONT_PATH = path.join(ROOT, 'playlet-lib/src/fonts/Vazirmatn-Regular.ttf');
const OUTPUT_DIR = path.join(ROOT, 'playlet-lib/src/images/kb-fa');

const SIZE = 48;
const FONT_SIZE = 34;
// Glyphs are first rendered on a larger canvas so their real bounding box can be
// measured without clipping, then re-rendered centered on the final canvas.
const MEASURE_SIZE = 128;
const MAX_CONVERSIONS_PER_BROWSER = 30;

const COLORS = {
    white: '#FFFFFF',
    black: '#000000',
};

const LETTERS = [
    ['alef_madda', 'آ'], // آ
    ['alef', 'ا'], // ا
    ['be', 'ب'], // ب
    ['pe', 'پ'], // پ
    ['te', 'ت'], // ت
    ['se', 'ث'], // ث
    ['jim', 'ج'], // ج
    ['che', 'چ'], // چ
    ['he_jimi', 'ح'], // ح
    ['khe', 'خ'], // خ
    ['dal', 'د'], // د
    ['zal', 'ذ'], // ذ
    ['re', 'ر'], // ر
    ['ze', 'ز'], // ز
    ['zhe', 'ژ'], // ژ
    ['sin', 'س'], // س
    ['shin', 'ش'], // ش
    ['sad', 'ص'], // ص
    ['zad', 'ض'], // ض
    ['ta', 'ط'], // ط
    ['za', 'ظ'], // ظ
    ['eyn', 'ع'], // ع
    ['gheyn', 'غ'], // غ
    ['fe', 'ف'], // ف
    ['ghaf', 'ق'], // ق
    ['kaf', 'ک'], // ک
    ['gaf', 'گ'], // گ
    ['lam', 'ل'], // ل
    ['mim', 'م'], // م
    ['nun', 'ن'], // ن
    ['vav', 'و'], // و
    ['he', 'ه'], // ه
    ['ye', 'ی'], // ی
];

(async () => {
    const fontBase64 = readFileSync(FONT_PATH).toString('base64');
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // A single converter hangs after ~85 conversions, so the browser is
    // relaunched every few letters.
    let converter = null;
    let conversions = 0;
    const getConverter = async () => {
        if (converter && conversions >= MAX_CONVERSIONS_PER_BROWSER) {
            await converter.close();
            converter = null;
        }
        if (!converter) {
            converter = await createConverter({ launch: { channel: 'chrome' } });
            conversions = 0;
        }
        conversions += 3;
        return converter;
    };

    try {
        for (const [name, letter] of LETTERS) {
            const converter = await getConverter();
            // Measure the glyph's ink bounding box on a big canvas, with the
            // baseline anchor at the canvas center.
            const measureSvg = letterSvg(fontBase64, letter, '#FFFFFF', MEASURE_SIZE, MEASURE_SIZE / 2, MEASURE_SIZE / 2);
            const measurePng = await converter.convert(measureSvg, { width: MEASURE_SIZE, height: MEASURE_SIZE });
            const box = alphaBoundingBox(measurePng);
            if (!box) {
                throw new Error(`Glyph for ${name} rendered empty`);
            }

            // Shift the anchor so the ink box center lands on the canvas center.
            const inkCenterX = (box.minX + box.maxX + 1) / 2;
            const inkCenterY = (box.minY + box.maxY + 1) / 2;
            const x = SIZE / 2 + (MEASURE_SIZE / 2 - inkCenterX);
            const y = SIZE / 2 + (MEASURE_SIZE / 2 - inkCenterY);
            const inkW = box.maxX - box.minX + 1;
            const inkH = box.maxY - box.minY + 1;
            if (inkW > SIZE || inkH > SIZE) {
                console.warn(`Warning: ${name} ink box ${inkW}x${inkH} exceeds ${SIZE}x${SIZE}`);
            }

            for (const [suffix, color] of Object.entries(COLORS)) {
                const svg = letterSvg(fontBase64, letter, color, SIZE, x, y);
                await writeIcon(converter, svg, `${name}-${suffix}.png`);
            }
            console.log(`Generated ${name} (ink ${inkW}x${inkH})`);
        }

        const zwnjConverter = await getConverter();
        for (const [suffix, color] of Object.entries(COLORS)) {
            await writeIcon(zwnjConverter, zwnjSvg(color), `zwnj-${suffix}.png`);
        }
        console.log('Generated zwnj');
    } finally {
        if (converter) {
            await converter.close();
        }
    }

    console.log('Done.');
})();

async function writeIcon(converter, svg, fileName) {
    const png = await converter.convert(svg, { width: SIZE, height: SIZE });
    writeFileSync(path.join(OUTPUT_DIR, fileName), png);
}

function letterSvg(fontBase64, letter, color, size, x, y) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <style>
      @font-face {
        font-family: 'VazirmatnKb';
        src: url(data:font/ttf;base64,${fontBase64}) format('truetype');
      }
    </style>
  </defs>
  <text x="${x}" y="${y}" fill="${color}" font-family="VazirmatnKb" font-size="${FONT_SIZE}" text-anchor="middle" direction="rtl">${letter}</text>
</svg>`;
}

// ZWNJ (zero-width non-joiner) key: a vertical bar with two chevrons pointing
// away from it, i.e. "‹|›", meaning "keep the letters apart".
function zwnjSvg(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <line x1="24" y1="10" x2="24" y2="38" />
    <polyline points="16,16 8,24 16,32" />
    <polyline points="32,16 40,24 32,32" />
  </g>
</svg>`;
}

// Minimal PNG decoder (8-bit RGBA / RGB, non-interlaced, as produced by Chrome)
// returning the bounding box of pixels with non-zero alpha.
function alphaBoundingBox(pngBuffer) {
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    const idat = [];
    while (offset < pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
        const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            const bitDepth = data[8];
            colorType = data[9];
            if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || data[12] !== 0) {
                throw new Error(`Unsupported PNG format (bitDepth ${bitDepth}, colorType ${colorType})`);
            }
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset += 12 + length;
    }

    const bpp = colorType === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * bpp;
    const pixels = Buffer.alloc(stride * height);
    for (let row = 0; row < height; row++) {
        const filter = raw[row * (stride + 1)];
        const src = row * (stride + 1) + 1;
        const dst = row * stride;
        for (let i = 0; i < stride; i++) {
            const cur = raw[src + i];
            const left = i >= bpp ? pixels[dst + i - bpp] : 0;
            const up = row > 0 ? pixels[dst - stride + i] : 0;
            const upLeft = row > 0 && i >= bpp ? pixels[dst - stride + i - bpp] : 0;
            let value;
            switch (filter) {
                case 0: value = cur; break;
                case 1: value = cur + left; break;
                case 2: value = cur + up; break;
                case 3: value = cur + ((left + up) >> 1); break;
                case 4: value = cur + paeth(left, up, upLeft); break;
                default: throw new Error(`Unknown PNG filter ${filter}`);
            }
            pixels[dst + i] = value & 0xff;
        }
    }

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = y * stride + x * bpp;
            // RGB has no alpha: treat non-black as ink (glyph is white when measuring).
            const ink = bpp === 4 ? pixels[p + 3] > 0 : (pixels[p] | pixels[p + 1] | pixels[p + 2]) > 0;
            if (ink) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}
