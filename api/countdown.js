const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// Load font as base64 for SVG embedding
let fontBase64 = "";
const fontPaths = [
  path.join(__dirname, "..", "fonts", "Inter-Bold.ttf"),
  path.join(process.cwd(), "fonts", "Inter-Bold.ttf"),
  "/var/task/fonts/Inter-Bold.ttf",
];
for (const fp of fontPaths) {
  try {
    if (fs.existsSync(fp)) {
      fontBase64 = fs.readFileSync(fp).toString("base64");
      break;
    }
  } catch (e) {}
}

module.exports = async (req, res) => {
  try {
    if (req.query.debug === "1") {
      return res.status(200).json({
        fontLoaded: fontBase64.length > 0,
        fontBytes: fontBase64.length,
      });
    }

    const {
      date,
      tz = "-3",
      bg = "004E9A",
      fg = "FFFFFF",
      accent = "FFD700",
      w = "600",
      h = "200",
      frames = "30",
      label = "TERMINA EN!",
      expired = "TIEMPO AGOTADO!",
    } = req.query;

    if (!date) {
      return res.status(400).json({
        error: "Missing 'date' parameter",
        usage: "GET /countdown?date=2026-05-17T23:59:00&tz=-3",
      });
    }

    const width = parseInt(w, 10);
    const height = parseInt(h, 10);
    const totalFrames = Math.min(parseInt(frames, 10), 60);
    const tzOffset = parseFloat(tz);
    const targetMs = parseTargetDate(date, tzOffset);

    const gif = GIFEncoder();
    const renderNow = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      const adjustedDiff = targetMs - renderNow - i * 1000;
      const time = adjustedDiff > 0 ? msToTime(adjustedDiff) : null;

      const svg = buildSVG(width, height, time, bg, fg, accent, label, expired);

      const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: width },
      });
      const pngData = resvg.render();
      const pixels = pngData.pixels; // Uint8Array RGBA

      const palette = quantize(pixels, 256, { format: "rgba4444" });
      const index = applyPalette(pixels, palette, "rgba4444");
      gif.writeFrame(index, width, height, { palette, delay: 1000 });
    }

    gif.finish();
    const buffer = Buffer.from(gif.bytes());

    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Countdown error:", err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};

// ──────────────────────────────────────────────
// SVG Builder
// ──────────────────────────────────────────────

function buildSVG(w, h, time, bg, fg, accent, label, expiredMsg) {
  const fontFace = fontBase64
    ? `<defs><style>
        @font-face {
          font-family: 'CF';
          src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
          font-weight: bold;
        }
      </style></defs>`
    : "";

  const fontFamily = fontBase64 ? "CF" : "Arial, Helvetica, sans-serif";

  if (!time) {
    // Expired state
    const expSize = Math.round(h * 0.18);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${fontFace}
      <rect width="${w}" height="${h}" fill="#${bg}" rx="0"/>
      <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central"
            font-family="${fontFamily}" font-weight="bold" font-size="${expSize}" fill="#${fg}">
        ${escXml(expiredMsg)}
      </text>
    </svg>`;
  }

  const { days, hours, minutes, seconds } = time;
  const labelSize = Math.round(h * 0.12);
  const numSize = Math.round(h * 0.36);
  const unitSize = Math.round(h * 0.09);
  const colonSize = Math.round(h * 0.30);

  const positions = [0.125, 0.375, 0.625, 0.875];
  const colonPositions = [0.25, 0.50, 0.75];
  const values = [
    { num: pad(days), unit: "DÍAS" },
    { num: pad(hours), unit: "HRS" },
    { num: pad(minutes), unit: "MIN" },
    { num: pad(seconds), unit: "SEG" },
  ];

  const pillTop = h * 0.26;
  const pillW = w * 0.19;
  const pillH = h * 0.50;
  const pillR = 10;

  let elements = "";

  // Background
  elements += `<rect width="${w}" height="${h}" fill="#${bg}"/>`;

  // Label
  elements += `<text x="${w / 2}" y="${h * 0.05 + labelSize * 0.8}"
    text-anchor="middle" font-family="${fontFamily}" font-weight="bold"
    font-size="${labelSize}" fill="#${accent}">${escXml(label)}</text>`;

  // Pills + numbers + units
  for (let i = 0; i < 4; i++) {
    const cx = w * positions[i];
    const px = cx - pillW / 2;

    // Pill
    elements += `<rect x="${px}" y="${pillTop}" width="${pillW}" height="${pillH}"
      rx="${pillR}" fill="rgba(0,0,0,0.25)"/>`;

    // Number
    elements += `<text x="${cx}" y="${pillTop + pillH * 0.52}"
      text-anchor="middle" dominant-baseline="central"
      font-family="${fontFamily}" font-weight="bold"
      font-size="${numSize}" fill="#${fg}">${values[i].num}</text>`;

    // Unit
    elements += `<text x="${cx}" y="${pillTop + pillH + h * 0.03 + unitSize * 0.9}"
      text-anchor="middle" font-family="${fontFamily}" font-weight="bold"
      font-size="${unitSize}" fill="#${accent}">${values[i].unit}</text>`;
  }

  // Colons
  for (const cp of colonPositions) {
    elements += `<text x="${w * cp}" y="${pillTop + pillH * 0.48}"
      text-anchor="middle" dominant-baseline="central"
      font-family="${fontFamily}" font-weight="bold"
      font-size="${colonSize}" fill="#${fg}">:</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${fontFace}
    ${elements}
  </svg>`;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function parseTargetDate(dateStr, tzOffset) {
  const d = new Date(dateStr);
  return d.getTime() - tzOffset * 60 * 60 * 1000;
}

function msToTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function escXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
