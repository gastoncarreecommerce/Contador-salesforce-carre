const { createCanvas } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// ──────────────────────────────────────────────
// 7-segment style digit maps (5 wide x 7 tall)
// 1 = filled, 0 = empty
// ──────────────────────────────────────────────
const DIGITS = {
  "0": [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ],
  "1": [
    [0,0,1,0,0],
    [0,1,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
  ],
  "2": [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
  ],
  "3": [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
  ],
  "4": [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
  ],
  "5": [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
  ],
  "6": [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ],
  "7": [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
  ],
  "8": [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ],
  "9": [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
  ],
  ":": [
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
  ],
};

// Small 3x5 font for labels
const SMALL_CHARS = {
  "D": [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
  "I": [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  "A": [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  "S": [[0,1,1],[1,0,0],[0,1,0],[0,0,1],[1,1,0]],
  "H": [[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  "O": [[0,1,0],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  "R": [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  "M": [[1,0,1],[1,1,1],[1,1,1],[1,0,1],[1,0,1]],
  "N": [[1,0,1],[1,1,1],[1,1,1],[1,0,1],[1,0,1]],
  "E": [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  "G": [[0,1,1],[1,0,0],[1,0,1],[1,0,1],[0,1,1]],
  "T": [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  "L": [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  "F": [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,0,0]],
  "!": [[0,1,0],[0,1,0],[0,1,0],[0,0,0],[0,1,0]],
  " ": [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
  "P": [[1,1,0],[1,0,1],[1,1,0],[1,0,0],[1,0,0]],
  "C": [[0,1,1],[1,0,0],[1,0,0],[1,0,0],[0,1,1]],
  "U": [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  "V": [[1,0,1],[1,0,1],[1,0,1],[0,1,0],[0,1,0]],
  "W": [[1,0,1],[1,0,1],[1,1,1],[1,1,1],[1,0,1]],
  "X": [[1,0,1],[1,0,1],[0,1,0],[1,0,1],[1,0,1]],
  "Y": [[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
  "Z": [[1,1,1],[0,0,1],[0,1,0],[1,0,0],[1,1,1]],
  "B": [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  "J": [[0,0,1],[0,0,1],[0,0,1],[1,0,1],[0,1,0]],
  "K": [[1,0,1],[1,1,0],[1,0,0],[1,1,0],[1,0,1]],
  "Q": [[0,1,0],[1,0,1],[1,0,1],[1,1,1],[0,1,1]],
};

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
      label = "TERMINA EN",
      expired = "TIEMPO AGOTADO",
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
        drawBitmapText(ctx, expired, width / 2, height / 2, Math.floor(height / 20), 1, fgColor, "center");
      } else {
        const time = msToTime(adjustedDiff);
        drawFrame(ctx, width, height, time, fgColor, accentColor, bgHex, label);
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
// Main drawing
// ──────────────────────────────────────────────

function drawFrame(ctx, w, h, time, fgColor, accentColor, bgHex, label) {
  const { days, hours, minutes, seconds } = time;

  // Layout constants
  const pixelSize = Math.max(2, Math.floor(h / 28)); // size of each "pixel" in digit
  const digitW = 5 * pixelSize;
  const digitH = 7 * pixelSize;
  const colonW = 5 * pixelSize;
  const gap = Math.floor(pixelSize * 1.5); // gap between digit pairs
  const pairGap = Math.floor(pixelSize * 0.5); // gap between two digits in a pair

  // Total width: 4 pairs of 2 digits + 3 colons + gaps
  const totalW = 4 * (2 * digitW + pairGap) + 3 * colonW + 6 * gap;
  const startX = Math.floor((w - totalW) / 2);
  const startY = Math.floor(h * 0.25);

  // Draw label at top
  const labelPixel = Math.max(1, Math.floor(pixelSize * 0.5));
  drawBitmapText(ctx, label, w / 2, h * 0.08, labelPixel, 1, accentColor, "center");

  const pairs = [
    String(days).padStart(2, "0"),
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ];
  const labels = ["DIAS", "HORAS", "MIN", "SEG"];

  let curX = startX;

  for (let p = 0; p < 4; p++) {
    const d1 = pairs[p][0];
    const d2 = pairs[p][1];

    // Pill background
    const pillPad = Math.floor(pixelSize * 0.8);
    const pillW = 2 * digitW + pairGap + 2 * pillPad;
    const pillH = digitH + 2 * pillPad;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    roundRect(ctx, curX - pillPad, startY - pillPad, pillW, pillH, pixelSize);
    ctx.fill();

    // First digit
    drawDigit(ctx, d1, curX, startY, pixelSize, fgColor);
    curX += digitW + pairGap;

    // Second digit
    drawDigit(ctx, d2, curX, startY, pixelSize, fgColor);
    curX += digitW + pillPad;

    // Unit label below
    const labelY = startY + digitH + Math.floor(pixelSize * 1.5);
    const labelCenterX = curX - pillPad - pillW / 2;
    drawBitmapText(ctx, labels[p], labelCenterX, labelY, Math.max(1, Math.floor(pixelSize * 0.4)), 1, accentColor, "center");

    // Colon separator (except after last)
    if (p < 3) {
      curX += gap;
      drawDigit(ctx, ":", curX, startY, pixelSize, fgColor);
      curX += colonW + gap;
    }
  }
}

// ──────────────────────────────────────────────
// Bitmap rendering functions
// ──────────────────────────────────────────────

function drawDigit(ctx, char, x, y, pixelSize, color) {
  const map = DIGITS[char];
  if (!map) return;
  ctx.fillStyle = color;
  for (let row = 0; row < map.length; row++) {
    for (let col = 0; col < map[row].length; col++) {
      if (map[row][col]) {
        ctx.fillRect(
          x + col * pixelSize,
          y + row * pixelSize,
          pixelSize - 1,
          pixelSize - 1
        );
      }
    }
  }
}

function drawBitmapText(ctx, text, x, y, pixelSize, spacing, color, align) {
  const chars = text.toUpperCase().split("");
  const charW = 3 * pixelSize + spacing * pixelSize;
  const totalW = chars.length * charW - spacing * pixelSize;

  let startX;
  if (align === "center") {
    startX = Math.floor(x - totalW / 2);
  } else {
    startX = x;
  }

  ctx.fillStyle = color;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const map = SMALL_CHARS[ch];
    if (!map) continue;
    const cx = startX + i * charW;
    for (let row = 0; row < map.length; row++) {
      for (let col = 0; col < map[row].length; col++) {
        if (map[row][col]) {
          ctx.fillRect(
            cx + col * pixelSize,
            y + row * pixelSize,
            pixelSize,
            pixelSize
          );
        }
      }
    }
  }
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
