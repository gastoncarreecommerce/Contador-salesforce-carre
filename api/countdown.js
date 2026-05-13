const fs = require("fs");
const path = require("path");
const satori = require("satori");
const { Resvg } = require("@resvg/resvg-js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// Load font buffer at cold start
let fontData = null;
const tryPaths = [
  path.join(__dirname, "..", "fonts", "Inter-Bold.ttf"),
  path.join(process.cwd(), "fonts", "Inter-Bold.ttf"),
  "/var/task/fonts/Inter-Bold.ttf",
];
for (const fp of tryPaths) {
  try {
    if (fs.existsSync(fp)) {
      fontData = fs.readFileSync(fp);
      break;
    }
  } catch (e) {}
}

module.exports = async (req, res) => {
  try {
    if (req.query.debug === "1") {
      return res.status(200).json({ fontLoaded: !!fontData, fontSize: fontData?.length });
    }

    const {
      date, tz = "-3", bg = "004E9A", fg = "FFFFFF", accent = "FFD700",
      w = "600", h = "200", frames = "30",
      label = "TERMINA EN!", expired = "TIEMPO AGOTADO!",
    } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Missing 'date' param", usage: "/countdown?date=2026-05-17T23:59:00&tz=-3" });
    }

    const width = parseInt(w);
    const height = parseInt(h);
    const totalFrames = Math.min(parseInt(frames), 60);
    const tzOffset = parseFloat(tz);
    const targetMs = parseTargetDate(date, tzOffset);
    const renderNow = Date.now();

    const satoriOpts = {
      width,
      height,
      fonts: [
        {
          name: "Inter",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    };

    const gif = GIFEncoder();

    for (let i = 0; i < totalFrames; i++) {
      const diff = targetMs - renderNow - i * 1000;
      const time = diff > 0 ? msToTime(diff) : null;

      // Satori takes a React-like element tree (plain objects)
      const markup = buildMarkup(width, height, time, bg, fg, accent, label, expired);

      // satori returns SVG string
      const svg = await satori.default(markup, satoriOpts);

      // resvg rasterizes SVG to RGBA pixels
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
      const rendered = resvg.render();
      const pixels = rendered.pixels;

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
// Markup builder (satori virtual DOM)
// Satori uses React-like objects: { type, props, children }
// We use the h() helper below
// ──────────────────────────────────────────────

function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children.length ? children : undefined } };
}

function buildMarkup(width, height, time, bg, fg, accent, label, expiredMsg) {
  const numSize = Math.round(height * 0.34);
  const unitSize = Math.round(height * 0.085);
  const labelSize = Math.round(height * 0.11);
  const colonSize = Math.round(height * 0.28);

  if (!time) {
    return h("div", {
      style: {
        width: `${width}px`, height: `${height}px`, display: "flex",
        alignItems: "center", justifyContent: "center",
        backgroundColor: `#${bg}`, color: `#${fg}`,
        fontFamily: "Inter", fontWeight: 700, fontSize: `${Math.round(height * 0.18)}px`,
      }
    }, expiredMsg);
  }

  const { days, hours, minutes, seconds } = time;
  const blocks = [
    { num: pad(days), unit: "DÍAS" },
    { num: pad(hours), unit: "HRS" },
    { num: pad(minutes), unit: "MIN" },
    { num: pad(seconds), unit: "SEG" },
  ];

  const numberBlocks = [];
  for (let i = 0; i < blocks.length; i++) {
    // Number pill
    numberBlocks.push(
      h("div", {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "2px",
        }
      },
        h("div", {
          style: {
            backgroundColor: "rgba(0,0,0,0.25)", borderRadius: "10px",
            padding: "8px 14px", display: "flex", alignItems: "center",
            justifyContent: "center", minWidth: `${Math.round(width * 0.16)}px`,
          }
        },
          h("span", {
            style: {
              color: `#${fg}`, fontSize: `${numSize}px`,
              fontFamily: "Inter", fontWeight: 700, lineHeight: 1,
            }
          }, blocks[i].num)
        ),
        h("span", {
          style: {
            color: `#${accent}`, fontSize: `${unitSize}px`,
            fontFamily: "Inter", fontWeight: 700, marginTop: "4px",
          }
        }, blocks[i].unit)
      )
    );

    // Colon (except after last)
    if (i < blocks.length - 1) {
      numberBlocks.push(
        h("span", {
          style: {
            color: `#${fg}`, fontSize: `${colonSize}px`,
            fontFamily: "Inter", fontWeight: 700, lineHeight: 1,
            marginBottom: `${Math.round(height * 0.08)}px`,
            padding: "0 2px",
          }
        }, ":")
      );
    }
  }

  return h("div", {
    style: {
      width: `${width}px`, height: `${height}px`, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      backgroundColor: `#${bg}`, fontFamily: "Inter",
      gap: "0px", padding: "0",
    }
  },
    // Label
    h("span", {
      style: {
        color: `#${accent}`, fontSize: `${labelSize}px`,
        fontWeight: 700, marginBottom: "6px",
      }
    }, label),
    // Numbers row
    h("div", {
      style: {
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "4px",
      }
    }, ...numberBlocks)
  );
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
