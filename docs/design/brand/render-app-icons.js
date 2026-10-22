const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const brandDir = __dirname;
const outDir = path.join(brandDir, '..', '..', '..', 'apps', 'web', 'src', 'assets', 'icons');

const sourceSvg = fs.readFileSync(path.join(brandDir, 'icon-source.svg'), 'utf8');
const source16Svg = fs.readFileSync(path.join(brandDir, 'icon-source-16.svg'), 'utf8');
const source32Svg = fs.readFileSync(path.join(brandDir, 'icon-source-32.svg'), 'utf8');
const source48Svg = fs.readFileSync(path.join(brandDir, 'icon-source-48.svg'), 'utf8');

function makeMaskableSvg(scale = 0.6) {
  // The original frame is 75% of canvas (768/1024). To get the frame to ~60% of canvas,
  // we scale the whole primary mark by (0.6 / 0.75) = 0.8 and center it.
  const svg = sourceSvg
    .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">',
             '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><g transform="translate(102.4,102.4) scale(0.8)">')
    .replace('</svg>', '</g></svg>');
  return svg;
}

const maskableSvg = makeMaskableSvg();

async function renderPng(input, size, outputPath) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  await sharp(buffer)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  const stat = fs.statSync(outputPath);
  return { path: outputPath, size, width: size, height: size, bytes: stat.size };
}

async function renderIco(entries, outputPath) {
  // entries: [{ size, svg }]
  const buffers = [];
  const rendered = [];
  for (const { size, svg } of entries) {
    const pngBuffer = await sharp(Buffer.from(svg, 'utf8'))
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toBuffer();
    rendered.push({ size, pngBuffer });
    buffers.push(pngBuffer);
  }

  const count = rendered.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: icon
  header.writeUInt16LE(count, 4);

  const dirSize = 16 * count;
  let dataOffset = 6 + dirSize;
  const dirEntries = [];
  const dataBuffers = [];

  for (const { size, pngBuffer } of rendered) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // Colors
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Planes
    entry.writeUInt16LE(32, 6); // Bit count
    entry.writeUInt32LE(pngBuffer.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dirEntries.push(entry);
    dataBuffers.push(pngBuffer);
    dataOffset += pngBuffer.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...dataBuffers]);
  fs.writeFileSync(outputPath, icoBuffer);
  const stat = fs.statSync(outputPath);
  return { path: outputPath, sizes: rendered.map(r => r.size), bytes: stat.size };
}

async function renderContactSheet(icons, outputPath) {
  // icons: array of { label, filePath }
  // Layout: horizontal strip with labels, on half light / half dark background.
  const thumbSize = 128;
  const labelHeight = 32;
  const padding = 24;
  const gap = 24;
  const count = icons.length;
  const totalWidth = padding * 2 + count * thumbSize + (count - 1) * gap;
  const totalHeight = padding * 2 + thumbSize + labelHeight + 8;

  const halfWidth = Math.floor(totalWidth / 2);

  // Build background: left half light (#F5F6F8), right half dark (#0F1115).
  const bgLight = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">` +
    `<rect x="0" y="0" width="${halfWidth}" height="${totalHeight}" fill="#F5F6F8"/>` +
    `<rect x="${halfWidth}" y="0" width="${totalWidth - halfWidth}" height="${totalHeight}" fill="#0F1115"/>` +
    `</svg>`
  );

  const composite = sharp(bgLight);
  const overlays = [];
  for (let i = 0; i < icons.length; i++) {
    const { label, filePath } = icons[i];
    const x = padding + i * (thumbSize + gap);
    const y = padding;
    const resized = await sharp(filePath)
      .resize(thumbSize, thumbSize, { kernel: sharp.kernel.lanczos3 })
      .toBuffer();
    overlays.push({ input: resized, left: x, top: y });

    // Choose label color based on which half of the canvas the icon sits in.
    const fill = x + thumbSize / 2 < halfWidth ? '#333333' : '#F5F6F8';
    const textSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${thumbSize}" height="${labelHeight}">` +
      `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="${fill}">${label}</text>` +
      `</svg>`
    );
    const labelPng = await sharp(textSvg).png().toBuffer();
    overlays.push({ input: labelPng, left: x, top: y + thumbSize + 8 });
  }

  await composite.composite(overlays).png({ compressionLevel: 9 }).toFile(outputPath);
  const stat = fs.statSync(outputPath);
  return { path: outputPath, bytes: stat.size };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];

  // Primary PNG exports
  results.push(await renderPng(sourceSvg, 256, path.join(outDir, 'icon.png')));
  results.push(await renderPng(sourceSvg, 256, path.join(outDir, 'favicon.png')));
  results.push(await renderPng(sourceSvg, 256, path.join(outDir, 'favicon.256x256.png')));
  results.push(await renderPng(sourceSvg, 512, path.join(outDir, 'favicon.512x512.png')));

  results.push(await renderPng(source16Svg, 16, path.join(outDir, 'icon-16.png')));
  results.push(await renderPng(source32Svg, 32, path.join(outDir, 'icon-32.png')));
  results.push(await renderPng(source48Svg, 48, path.join(outDir, 'icon-48.png')));
  results.push(await renderPng(sourceSvg, 64, path.join(outDir, 'icon-64.png')));
  results.push(await renderPng(sourceSvg, 128, path.join(outDir, 'icon-128.png')));
  results.push(await renderPng(sourceSvg, 1024, path.join(outDir, 'icon-1024.png')));

  results.push(await renderPng(sourceSvg, 180, path.join(outDir, 'apple-touch-icon.png')));

  results.push(await renderPng(sourceSvg, 192, path.join(outDir, 'android-chrome-192x192.png')));
  results.push(await renderPng(sourceSvg, 512, path.join(outDir, 'android-chrome-512x512.png')));

  results.push(await renderPng(maskableSvg, 192, path.join(outDir, 'android-chrome-maskable-192x192.png')));
  results.push(await renderPng(maskableSvg, 512, path.join(outDir, 'android-chrome-maskable-512x512.png')));

  // Multi-resolution favicon.ico (PNG-in-ICO, supported since Windows Vista)
  const icoEntries = [
    { size: 16, svg: source16Svg },
    { size: 24, svg: source32Svg }, // downscale from 32 px variant for crisp small icon
    { size: 32, svg: source32Svg },
    { size: 48, svg: source48Svg },
    { size: 64, svg: sourceSvg },
    { size: 128, svg: sourceSvg },
    { size: 256, svg: sourceSvg },
  ];
  results.push(await renderIco(icoEntries, path.join(outDir, 'favicon.ico')));

  // Contact sheet: representative set of app icon files
  const contactIcons = [
    { label: '16 px', filePath: path.join(outDir, 'icon-16.png') },
    { label: '32 px', filePath: path.join(outDir, 'icon-32.png') },
    { label: '48 px', filePath: path.join(outDir, 'icon-48.png') },
    { label: '64 px', filePath: path.join(outDir, 'icon-64.png') },
    { label: '128 px', filePath: path.join(outDir, 'icon-128.png') },
    { label: '256 px', filePath: path.join(outDir, 'icon.png') },
    { label: '512 px', filePath: path.join(outDir, 'favicon.512x512.png') },
    { label: '1024 px', filePath: path.join(outDir, 'icon-1024.png') },
    { label: 'mask 192', filePath: path.join(outDir, 'android-chrome-maskable-192x192.png') },
  ];
  const contactPath = path.join(brandDir, 'contact-sheet.png');
  results.push(await renderContactSheet(contactIcons, contactPath));

  console.log(JSON.stringify(results, null, 2));
})();
