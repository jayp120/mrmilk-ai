// generate-icons.js — run with: node generate-icons.js
// Generates icon16.png, icon48.png, icon128.png for the extension

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const r = size * 0.12; // corner radius

  // Background — forest green
  ctx.fillStyle = '#1a3a16';
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  // Milk drop shape (white)
  ctx.fillStyle = '#ffffff';
  const cx = size / 2;
  const dropH = size * 0.52;
  const dropW = size * 0.38;
  const dropY = size * 0.22;

  // Draw milk drop
  ctx.beginPath();
  ctx.moveTo(cx, dropY);
  ctx.bezierCurveTo(
    cx + dropW * 0.6, dropY + dropH * 0.3,
    cx + dropW,       dropY + dropH * 0.65,
    cx,               dropY + dropH
  );
  ctx.bezierCurveTo(
    cx - dropW,       dropY + dropH * 0.65,
    cx - dropW * 0.6, dropY + dropH * 0.3,
    cx,               dropY
  );
  ctx.closePath();
  ctx.fill();

  // Gold accent line at bottom
  ctx.fillStyle = '#c8841a';
  ctx.fillRect(0, size * 0.82, size, size * 0.18);

  // Re-apply corner clip for gold bar
  ctx.globalCompositeOperation = 'destination-in';
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach(size => {
  try {
    const buf = generateIcon(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
    console.log(`✓ Generated icon${size}.png`);
  } catch (e) {
    console.warn(`⚠ Could not generate icon${size}.png (canvas package missing)`);
    console.warn('  Run: npm install canvas  OR  use the SVG fallback icons provided');
  }
});
