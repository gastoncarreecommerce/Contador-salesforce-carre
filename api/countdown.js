const { createCanvas } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

/**
 * Countdown Timer GIF Generator for SFMC Emails
 *
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
      label = "¡TERMINA EN!",
      font = "Arial",
      expired = "¡TIEMPO AGOTADO!",
    } = req.query;

    if (!date) {
      return res.status(400).json({
        error: "Missing 'date' parameter",
        usage: "GET /countdown?date=2026-05-17T23:59:00&tz=-3",
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
    const totalFrames = Math.min(parseInt(frames, 10), 60);
    const tzOffset = parseFloat(tz);

    const bgColor = hexToRgb(bg);
    const fgColor = `#${fg}`;
    const accentColor = `#${accent}`;
    const targetMs = parseTargetDate(date, tzOffset);

    // gifenc encoder
    const gif = GIFEncoder();

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const renderNow = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      const adjustedDiff = targetMs - renderNow - i * 1000;

      // Clear
      ctx.fillStyle = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
      ctx.fillRect(0, 0, width, height);

      if (adjustedDiff <= 0) {
        drawExpired(ctx, width, height, fgColor, accentColor, expired, font);
      } else {
        const time = msToTime(adjustedDiff);
        drawCountdown(ctx, width, height, time, fgColor, accentColor, label, font);
      }

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;

      // Convert RGBA to flat RGB for gifenc
      const rgb = new Uint8Array(width * height * 3);
      for (let p = 0; p < width * height; p++) {
        rgb[p * 3] = data[p * 4];
        rgb[p * 3 + 1] = data[p * 4 + 1];
        rgb[p * 3 + 2] = data[p * 4 + 2];
      }

      const palette = quantize(rgb, 256, { format: "rgb333" });
      const index = applyPalette(rgb, palette, "rgb333");

      gif.writeFrame(index, width, height, { palette, delay: 100 });
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
// Drawing
// ──────────────────────────────────────────────

function drawCountdown(ctx, w, h, time, fgColor, accentColor, label, fontFamily) {
  const { days, hours, minutes, seconds } = time;

  // Top label
  const labelSize = Math.round(h * 0.13);
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${labelSize}px "${fontFamily}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, w / 2, h * 0.06);

  const numSize = Math.round(h * 0.32);
  const unitSize = Math.round(h * 0.09);
  const numY = h * 0.30;
  const unitY = numY + numSize + h * 0.02;

  const positions = [0.15, 0.37, 0.59, 0.81];
  const values = [
    { num: String(days).padStart(2, "0"), unit: "DIAS" },
    { num: String(hours).padStart(2, "0"), unit: "HORAS" },
    { num: String(minutes).padStart(2, "0"), unit: "MIN" },
    { num: String(seconds).padStart(2, "0"), unit: "SEG" },
  ];

  // Separators
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${numSize}px "${fontFamily}", sans-serif`;
  ctx.textBaseline = "top";
  for (const sp of [0.26, 0.48, 0.70]) {
    ctx.fillText(":", w * sp, numY);
  }

  // Numbers + units
  for (let i = 0; i < 4; i++) {
    const x = w * positions[i];

    // Pill background
    const pillW = w * 0.17;
    const pillH = numSize * 1.3;
    const pillX = x - pillW / 2;
    const pillY = numY - numSize * 0.1;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.fill();

    // Number
    ctx.fillStyle = fgColor;
    ctx.font = `bold ${numSize}px "${fontFamily}", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(values[i].num, x, numY);

    // Unit
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${unitSize}px "${fontFamily}", sans-serif`;
    ctx.fillText(values[i].unit, x, unitY);
  }
}

function drawExpired(ctx, w, h, fgColor, accentColor, message, fontFamily) {
  const size = Math.round(h * 0.18);
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${size}px "${fontFamily}", sans-serif`;
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

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}
