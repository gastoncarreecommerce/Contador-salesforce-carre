const fs = require("fs");
const path = require("path");
const satori = require("satori");
const { Resvg } = require("@resvg/resvg-js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

// ──────────────────────────────────────────────
// Carga de la fuente en el arranque en frío (cold start)
// ──────────────────────────────────────────────
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
    // Endpoint de debug
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

    // Validación defensiva: Evitar error criptico si falla la carga del .ttf
    if (!fontData) {
      return res.status(500).json({ 
        error: "Font file not found on server. Revisa que el archivo exista y sea un .ttf válido.", 
        cwd: process.cwd(),
        dirname: __dirname
      });
    }

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

      // Construimos el layout tipo React para Satori
      const markup = buildMarkup(width, height, time, bg, fg, accent, label, expired);

      // Satori convierte el layout matemático a SVG
      const svg = await satori.default(markup, satoriOpts);

      // resvg rasteriza los vectores a píxeles RGBA
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
      const rendered = resvg.render();
      const pixels = rendered.pixels;

      // gifenc aplica la paleta de colores y lo guarda en el frame del GIF
      const palette = quantize(pixels, 256, { format: "rgba4444" });
      const index = applyPalette(pixels, palette, "rgba4444");
      gif.writeFrame(index, width, height, { palette, delay: 1000 });
    }

    gif.finish();
    const buffer = Buffer.from(gif.bytes());

    // ──────────────────────────────────────────────
    // HEADERS DE CACHÉ (La magia para aguantar 5 millones de emails)
    // ──────────────────────────────────────────────
    res.setHeader("Content-Type", "image/gif");
    // Guarda el GIF en la Edge Network de Vercel por 60 segundos. 
    // Las miles de personas que abran el mail en el mismo minuto verán la misma imagen sin gastar tu CPU.
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=30");
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Countdown error:", err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};

// ──────────────────────────────────────────────
// Markup builder (Satori virtual DOM)
// ──────────────────────────────────────────────

function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children.length ? children : undefined } };
}

function buildMarkup(width, height, time, bg, fg, accent, label, expiredMsg) {
  const numSize = Math.round(height * 0.34);
  const unitSize = Math.round(height * 0.085);
  const labelSize = Math.round(height * 0.11);
  const colonSize = Math.round(height * 0.28);

  // Pantalla de Tiempo Agotado
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

    // Separador ':' (excepto al final)
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
    // Label superior
    h("span", {
      style: {
        color: `#${accent}`, fontSize: `${labelSize}px`,
        fontWeight: 700, marginBottom: "6px",
      }
    }, label),
    // Fila de números
    h("div", {
      style: {
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "4px",
      }
    }, ...numberBlocks)
  );
}

// ──────────────────────────────────────────────
// Funciones de ayuda
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
