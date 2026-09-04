const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const LOGO_FILE = path.join(process.cwd(), 'public', 'assets', 'logos', 'cropped-logo.png');

function escXml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function overlay(imgDir, title, category) {
  const heroFile = path.join(imgDir, 'hero.jpg');
  if (!fs.existsSync(heroFile)) return;
  const w = 1600;
  const h = 900;
  const logoSize = Math.round(h * 0.155);
  const logoInset = Math.round(h * 0.045);
  const pad = Math.round(h * 0.018);

  const logoBuf = await sharp(LOGO_FILE).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  const safeTitle = escXml(title);
  const safeCategory = escXml(category);

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#040914" stop-opacity="0.88"/>
        <stop offset="1" stop-color="#040914" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#040914" stop-opacity="0"/>
        <stop offset="0.4" stop-color="#040914" stop-opacity="0.78"/>
        <stop offset="1" stop-color="#040914" stop-opacity="0.96"/>
      </linearGradient>
      <linearGradient id="goldBeam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#F5B800" stop-opacity="0.9"/>
        <stop offset="0.7" stop-color="#F5B800" stop-opacity="0.3"/>
        <stop offset="1" stop-color="#F5B800" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${Math.round(h * 0.32)}" fill="url(#topScrim)"/>
    <rect x="0" y="${Math.round(h * 0.36)}" width="${w}" height="${Math.round(h * 0.64)}" fill="url(#bottomScrim)"/>
    <rect x="0" y="${h - Math.round(h * 0.11)}" width="${w}" height="${Math.round(h * 0.11)}" fill="#060e1f" fill-opacity="0.95"/>
    <rect x="0" y="${h - Math.round(h * 0.11)}" width="${w}" height="2" fill="url(#goldBeam)"/>
    <rect x="${logoInset}" y="${logoInset}" width="${logoSize + pad * 2}" height="${logoSize + pad * 2}" rx="${Math.round(logoSize * 0.14)}" fill="#FFFFFF" fill-opacity="0.96" stroke="#F5B800" stroke-width="3"/>
    <text x="${logoInset + logoSize + pad * 2 + 25}" y="${logoInset + Math.round(logoSize * 0.44)}" font-family="Arial, sans-serif" font-size="24" font-weight="900" letter-spacing="2" fill="#FFFFFF">BVCITS</text>
    <text x="${logoInset + logoSize + pad * 2 + 25}" y="${logoInset + Math.round(logoSize * 0.44) + 26}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" letter-spacing="1" fill="#F5B800">AMALAPURAM · AUTONOMOUS</text>
    <rect x="${Math.round(w * 0.06)}" y="${h - 260}" width="260" height="36" rx="8" fill="#F5B800" fill-opacity="0.25" stroke="#F5B800" stroke-width="1.5"/>
    <text x="${Math.round(w * 0.06) + 15}" y="${h - 236}" font-family="Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="3" fill="#F5B800">${escXml(category.toUpperCase())}</text>
    <text x="${Math.round(w * 0.06)}" y="${h - 165}" font-family="Arial, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF">${escXml(title)}</text>
    <text x="${Math.round(w * 0.06)}" y="${h - 115}" font-family="Arial, sans-serif" font-size="20" font-weight="500" fill="#D1D5DB">BVCITS · Amalapuram, Konaseema</text>
    <text x="${Math.round(w * 0.06)}" y="${h - 40}" font-family="Arial, sans-serif" font-size="17" font-weight="bold" letter-spacing="2" fill="#F5B800">BONAM VENKATA CHALAMAYYA INSTITUTE OF TECHNOLOGY &amp; SCIENCE</text>
    <text x="${w - Math.round(w * 0.06)}" y="${h - 40}" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#E5E7EB">Counselling Code: <tspan fill="#F5B800">BVTS</tspan></text>
  </svg>`;

  const original = fs.readFileSync(heroFile);
  const base = sharp(original).resize(w, h, { fit: 'cover' });
  const result = await base.composite([
    { input: Buffer.from(svg), left: 0, top: 0 },
    { input: logoBuf, left: logoInset + pad, top: logoInset + pad }
  ]).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(heroFile, result);
  console.log('Successfully composited hero image in:', imgDir);
}

async function run() {
  const mediaDir = path.join(process.cwd(), 'public', 'blog-media');
  if (!fs.existsSync(mediaDir)) return;
  const dirs = fs.readdirSync(mediaDir);
  for (const d of dirs) {
    const full = path.join(mediaDir, d);
    if (fs.statSync(full).isDirectory()) {
      const name = d.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      await overlay(full, name, 'Career & Placements');
    }
  }
}
run();
