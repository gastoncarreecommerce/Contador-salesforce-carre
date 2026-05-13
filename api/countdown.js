const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// ──────────────────────────────────────────────
// Font registration — try multiple paths
// ──────────────────────────────────────────────
let fontLoaded = false;
const fontPaths = [
  path.join(__dirname, "..", "fonts", "Inter-Bold.ttf"),
  path.join(process.cwd(), "fonts", "Inter-Bold.ttf"),
  path.resolve("fonts", "Inter-Bold.ttf"),
  "/var/task/fonts/Inter-Bold.ttf",
];

for (const fp of fontPaths) {
  try {
    if (fs.existsSync(fp)) {
      const fontData = fs.readFileSync(fp);
      GlobalFonts.register(fontData, "Countdown");
      fontLoaded = true;
      break;
    }
  } catch (e) {
    // try next
  }
}

module.exports = async (req, res) => {
  try {
    // Debug mode: /countdown?debug=1
    if (req.query.debug === "1") {
      const info = {
        fontLoaded,
        triedPaths: fontPaths.map((fp) => ({ path: fp, exists: fs.existsSync(fp) })),
        cwd: process.cwd(),
        dirname: __dirname,
        fontsRegistered: GlobalFonts.families.map((f) => f.family),
      };
      return res.status(200).json(info);
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

    const fgColor = `#${fg}`;
    const accentColor = `#${accent}`;
    const bgHex = `#${bg}`;
    const targetMs = parseTargetDate(date, tzOffset);

    // Pick font family name
    const fontFamily = fontLoaded ? "Countdown" : "sans-serif";

    const gif = GIFEncoder();
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const renderNow = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      const adjustedDiff = targetMs - renderNow - i * 1000;

      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, width, height);

      if (adjustedDiff <= 0) {
        drawExpired(ctx, width, height, fgColor, expired, fontFamily);
      } else {
        const time = msToTime(adjustedDiff);
        drawCountdown(ctx, width, height, time, fgColor, accentColor, label, fontFamily);
      }

      const imageData = ctx.getImageData(0, 0, width, height);
      const rgba = new Uint8Array(imageData.data.buffer);
      const palette = quantize(rgba, 256, { format: "rgba4444" });
      const index = applyPalette(rgba, palette, "rgba4444");
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
// Drawing
// ──────────────────────────────────────────────

function drawCountdown(ctx, w, h, time, fgColor, accentColor, label, fontFamily) {
  const { days, hours, minutes, seconds } = time;

  // Label
  const labelSize = Math.round(h * 0.11);
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${labelSize}px "${fontFamily}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, w / 2, h * 0.05);

  // Number config
  const numSize = Math.round(h * 0.34);
  const unitSize = Math.round(h * 0.085);
  const positions = [0.125, 0.375, 0.625, 0.875];
  const values = [
    { num: String(days).padStart(2, "0"), unit: "DÍAS" },
    { num: String(hours).padStart(2, "0"), unit: "HRS" },
    { num: String(minutes).padStart(2, "0"), unit: "MIN" },
    { num: String(seconds).padStart(2, "0"), unit: "SEG" },
  ];

  const pillTop = h * 0.26;
  const pillW = w * 0.19;
  const pillH = h * 0.50;

  for (let i = 0; i < 4; i++) {
    const cx = w * positions[i];

    // Pill
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(ctx, cx - pillW / 2, pillTop, pillW, pillH, 10);
    ctx.fill();

    // Number
    ctx.fillStyle = fgColor;
    ctx.font = `bold ${numSize}px "${fontFamily}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(values[i].num, cx, pillTop + pillH * 0.48);

    // Unit
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${unitSize}px "${fontFamily}"`;
    ctx.textBaseline = "top";
    ctx.fillText(values[i].unit, cx, pillTop + pillH + h * 0.03);
  }

  // Colons
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${numSize}px "${fontFamily}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const colonY = pillTop + pillH * 0.48;
  ctx.fillText(":", w * 0.25, colonY);
  ctx.fillText(":", w * 0.50, colonY);
  ctx.fillText(":", w * 0.75, colonY);
}

function drawExpired(ctx, w, h, fgColor, message, fontFamily) {
  const size = Math.round(h * 0.16);
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${size}px "${fontFamily}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, w / 2, h / 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
