const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// Find font file path
let fontFilePath = "";
const fontPaths = [
  path.join(__dirname, "..", "fonts", "Inter-Bold.ttf"),
  path.join(process.cwd(), "fonts", "Inter-Bold.ttf"),
  "/var/task/fonts/Inter-Bold.ttf",
];
for (const fp of fontPaths) {
  try {
    if (fs.existsSync(fp)) {
      fontFilePath = fp;
      break;
    }
  } catch (e) {}
}

// Read font buffer once at cold start
let fontBuffer = null;
if (fontFilePath) {
  fontBuffer = fs.readFileSync(fontFilePath);
}

module.exports = async (req, res) => {
  try {
    if (req.query.debug === "1") {
      return res.status(200).json({
        fontFound: !!fontFilePath,
        fontPath: fontFilePath,
        fontSize: fontBuffer ? fontBuffer.length : 0,
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

    // Resvg options with font loaded
    const resvgOpts = {
      fitTo: { mode: "width", value: width },
      font: {
        fontBuffers: fontBuffer ? [fontBuffer] : [],
        loadSystemFonts: false,
        defaultFontFamily: "Inter",
      },
    };

    for (let i = 0; i < totalFrames; i++) {
      const adjustedDiff = targetMs - renderNow - i * 1000;
      const time = adjustedDiff > 0 ? msToTime(adjustedDiff) : null;

      const svg = buildSVG(width, height, time, bg, fg, accent, label, expired);

      const resvg = new Resvg(svg, resvgOpts);
      const pngData = resvg.render();
      const pixels = pngData.pixels;

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
  // Use "Inter" as font-family — resvg resolves it from fontBuffers
  const ff = "Inter";

  if (!time) {
    const expSize = Math.round(h * 0.18);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#${bg}"/>
      <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central"
            font-family="${ff}" font-weight="bold" font-size="${expSize}" fill="#${fg}">
        ${esc(expiredMsg)}
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

  let els = `<rect width="${w}" height="${h}" fill="#${bg}"/>`;

  // Label
  els += `<text x="${w / 2}" y="${h * 0.15}"
    text-anchor="middle" font-family="${ff}" font-weight="bold"
    font-size="${labelSize}" fill="#${accent}">${esc(label)}</text>`;

  for (let i = 0; i < 4; i++) {
    const cx = w * positions[i];

    // Pill
    els += `<rect x="${cx - pillW / 2}" y="${pillTop}" width="${pillW}" height="${pillH}"
      rx="10" fill="#000" fill-opacity="0.25"/>`;

    // Number
    els += `<text x="${cx}" y="${pillTop + pillH * 0.55}"
      text-anchor="middle" dominant-baseline="central"
      font-family="${ff}" font-weight="bold"
      font-size="${numSize}" fill="#${fg}">${values[i].num}</text>`;

    // Unit
    els += `<text x="${cx}" y="${pillTop + pillH + h * 0.12}"
      text-anchor="middle" font-family="${ff}" font-weight="bold"
      font-size="${unitSize}" fill="#${accent}">${values[i].unit}</text>`;
  }

  // Colons
  for (const cp of colonPositions) {
    els += `<text x="${w * cp}" y="${pillTop + pillH * 0.50}"
      text-anchor="middle" dominant-baseline="central"
      font-family="${ff}" font-weight="bold"
      font-size="${colonSize}" fill="#${fg}">:</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els}</svg>`;
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

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
