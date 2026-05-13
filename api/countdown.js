const { createCanvas } = require("canvas");
const GIFEncoder = require("gif-encoder-2");

/**
 * Countdown Timer GIF Generator for SFMC Emails
 *
 * Usage: GET /countdown?date=2026-05-17T23:59:00&tz=-3
 *
 * Query params:
 *   date     — Target datetime ISO (required). Example: 2026-05-17T23:59:00
 *   tz       — UTC offset in hours (default: -3 for Argentina)
 *   bg       — Background hex color (default: 004E9A — Carrefour blue)
 *   fg       — Foreground/text hex color (default: FFFFFF)
 *   accent   — Accent color for labels (default: FFD700)
 *   w        — Width in px (default: 600)
 *   h        — Height in px (default: 200)
 *   frames   — Number of frames to render (default: 30, each = 1 second)
 *   label    — Top label text (default: "¡TERMINA EN!")
 *   font     — Font family (default: "Arial Black")
 *   expired  — Message when expired (default: "¡TIEMPO AGOTADO!")
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
      label = "¡TERMINA EN!",
      font = "Arial Black",
      expired = "¡TIEMPO AGOTADO!",
    } = req.query;

    if (!date) {
      return res.status(400).json({
        error: "Missing 'date' parameter",
        usage:
          "GET /countdown?date=2026-05-17T23:59:00&tz=-3",
        params: {
          date: "ISO datetime (required)",
          tz: "UTC offset hours (default: -3)",
          bg: "Background hex (default: 004E9A)",
          fg: "Text hex (default: FFFFFF)",
          accent: "Label hex (default: FFD700)",
          w: "Width px (default: 600)",
          h: "Height px (default: 200)",
          frames: "Frames/seconds (default: 30)",
          label: "Top label (default: ¡TERMINA EN!)",
          expired: "Expired message (default: ¡TIEMPO AGOTADO!)",
        },
      });
    }

    const width = parseInt(w, 10);
    const height = parseInt(h, 10);
    const totalFrames = Math.min(parseInt(frames, 10), 60); // cap at 60 frames
    const tzOffset = parseFloat(tz);

    const bgColor = hexToRgb(bg);
    const fgColor = `#${fg}`;
    const accentColor = `#${accent}`;

    // Parse target date
    const targetMs = parseTargetDate(date, tzOffset);

    // Create GIF
    const encoder = new GIFEncoder(width, height, "neuquant", true);
    encoder.setDelay(1000); // 1 second per frame
    encoder.setRepeat(0); // loop forever
    encoder.setQuality(10);
    encoder.start();

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Get "now" at render time
    const renderNow = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      const nowMs = renderNow + i * 1000;
      const diff = targetMs - nowMs;

      // Clear
      ctx.fillStyle = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
      ctx.fillRect(0, 0, width, height);

      if (diff <= 0) {
        drawExpired(ctx, width, height, fgColor, accentColor, expired, font);
      } else {
        const time = msToTime(diff - i * 0 ); // each frame is 1s less
        const adjustedDiff = diff - i * 1000;
        const adjustedTime = msToTime(Math.max(0, adjustedDiff));
        drawCountdown(ctx, width, height, adjustedTime, fgColor, accentColor, label, font);
      }

      encoder.addFrame(ctx);
    }

    encoder.finish();
    const buffer = encoder.out.getData();

    // Response headers
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    // CORS for email clients that might need it
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

function drawCountdown(ctx, w, h, time, fgColor, accentColor, label, fontFamily) {
  const { days, hours, minutes, seconds } = time;

  // Top label
  const labelSize = Math.round(h * 0.13);
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${labelSize}px "${fontFamily}", "Arial", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, w / 2, h * 0.06);

  // Number sizing
  const numSize = Math.round(h * 0.32);
  const unitSize = Math.round(h * 0.09);
  const numY = h * 0.30;
  const unitY = numY + numSize + h * 0.02;

  // Positions — 4 blocks evenly spaced
  const positions = [0.15, 0.37, 0.59, 0.81];
  const values = [
    { num: String(days).padStart(2, "0"), unit: "DÍAS" },
    { num: String(hours).padStart(2, "0"), unit: "HORAS" },
    { num: String(minutes).padStart(2, "0"), unit: "MIN" },
    { num: String(seconds).padStart(2, "0"), unit: "SEG" },
  ];

  // Draw separators
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${numSize}px "${fontFamily}", "Arial", sans-serif`;
  ctx.textBaseline = "top";
  const separatorPositions = [0.26, 0.48, 0.70];
  for (const sp of separatorPositions) {
    ctx.fillText(":", w * sp, numY);
  }

  // Draw numbers and units
  for (let i = 0; i < 4; i++) {
    const x = w * positions[i];

    // Number background pill
    const pillW = w * 0.17;
    const pillH = numSize * 1.3;
    const pillX = x - pillW / 2;
    const pillY = numY - numSize * 0.1;
    const radius = 8;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(ctx, pillX, pillY, pillW, pillH, radius);
    ctx.fill();

    // Number
    ctx.fillStyle = fgColor;
    ctx.font = `bold ${numSize}px "${fontFamily}", "Arial", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(values[i].num, x, numY);

    // Unit label
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${unitSize}px "${fontFamily}", "Arial", sans-serif`;
    ctx.fillText(values[i].unit, x, unitY);
  }
}

function drawExpired(ctx, w, h, fgColor, accentColor, message, fontFamily) {
  const size = Math.round(h * 0.18);
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${size}px "${fontFamily}", "Arial", sans-serif`;
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
  // Parse as local time with given offset
  const d = new Date(dateStr);
  // Adjust: the date string is in "local" time of tzOffset
  // Convert to UTC by subtracting the offset
  const utcMs = d.getTime() - tzOffset * 60 * 60 * 1000;
  return utcMs;
}

function msToTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}
