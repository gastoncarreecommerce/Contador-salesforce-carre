const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// Register bundled font
const fontPath = path.join(__dirname, "..", "fonts", "Inter-Bold.ttf");
GlobalFonts.registerFromPath(fontPath, "InterBold");

/**
 * Countdown Timer GIF Generator for SFMC Emails
 * Usage: GET /countdown?date=2026-05-17T23:59:00&tz=-3
 */
module.exports = async (req, res) => {
  try {
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

    const gif = GIFEncoder();
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const renderNow = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      const adjustedDiff = targetMs - renderNow - i * 1000;

      // Clear background
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, width, height);

      if (adjustedDiff <= 0) {
        drawExpired(ctx, width, height, fgColor, expired);
      } else {
        const time = msToTime(adjustedDiff);
        drawCountdown(ctx, width, height, time, fgColor, accentColor, label);
      }

      // Encode frame
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
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};

// ──────────────────────────────────────────────
// Drawing functions
// ──────────────────────────────────────────────

function drawCountdown(ctx, w, h, time, fgColor, accentColor, label) {
  const { days, hours, minutes, seconds } = time;

  // Top label
  const labelSize = Math.round(h * 0.11);
  ctx.fillStyle = accentColor;
  ctx.font = `${labelSize}px InterBold`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, w / 2, h * 0.05);

  // Numbers
  const numSize = Math.round(h * 0.35);
  const unitSize = Math.round(h * 0.08);

  const positions = [0.125, 0.375, 0.625, 0.875];
  const values = [
    { num: String(days).padStart(2, "0"), unit: "DÍAS" },
    { num: String(hours).padStart(2, "0"), unit: "HORAS" },
    { num: String(minutes).padStart(2, "0"), unit: "MIN" },
    { num: String(seconds).padStart(2, "0"), unit: "SEG" },
  ];

  const numY = h * 0.28;
  const pillW = w * 0.19;
  const pillH = h * 0.48;

  for (let i = 0; i < 4; i++) {
    const cx = w * positions[i];

    // Pill background
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(ctx, cx - pillW / 2, numY, pillW, pillH, 10);
    ctx.fill();

    // Number
    ctx.fillStyle = fgColor;
    ctx.font = `${numSize}px InterBold`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(values[i].num, cx, numY + pillH * 0.45);

    // Unit label
    ctx.fillStyle = accentColor;
    ctx.font = `${unitSize}px InterBold`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(values[i].unit, cx, numY + pillH + h * 0.03);
  }

  // Colon separators between pairs
  ctx.fillStyle = fgColor;
  ctx.font = `${numSize}px InterBold`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const colonY = numY + pillH * 0.45;
  ctx.fillText(":", w * 0.25, colonY);
  ctx.fillText(":", w * 0.50, colonY);
  ctx.fillText(":", w * 0.75, colonY);
}

function drawExpired(ctx, w, h, fgColor, message) {
  const size = Math.round(h * 0.16);
  ctx.fillStyle = fgColor;
  ctx.font = `${size}px InterBold`;
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
