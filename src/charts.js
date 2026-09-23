// charts.js: numbers → SVG strings (SPEC.md §4). Owned by issue 5.
//
// Hand-written SVG (ADR-0009). Every chart is standalone text: xmlns set, presentation
// attributes only, a white background and a system font stack, so the same string looks
// the same inline in the page and saved as a .svg file.
//
//   histogramSVG(summaries, {width = 640, y = "fraction"})
//   chromBarsSVG(summaries, {width = 640, y = "fraction"})
//
// y: "fraction" (default) plots each file's share of its own peaks, so a 20,000-peak file
// and a 68,000-peak file compare by shape; "count" plots peaks. Either way every file
// shares one y scale and one x scale (§3.3), and each file's n is in its label.
window.PeakPeek = window.PeakPeek || {};

(function (PeakPeek) {
  "use strict";

  // Okabe–Ito, ordered so the first few files get the most distinct colours; yellow, the
  // weakest on white, is last. Files past the eighth reuse a colour, drawn as an outline.
  const PALETTE = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#000000", "#F0E442"];
  const FONT = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const CHAR_PX = 6.2; // rough width of an 11 px character: layout without measuring text
  const DEFAULT_WIDTH = 640;
  const MIN_WIDTH = 240;

  PeakPeek.histogramSVG = function (summaries, { width, y = "fraction" } = {}) {
    const W = chartWidth(width);
    const asCount = y === "count";
    const files = (summaries || []).map((s, i) => {
      const bins = ((s && s.histogram) || []).filter(
        (b) => b && isFinite(b.from) && isFinite(b.to) && isFinite(b.n)
      );
      return { label: fileLabel(s, i), bins, total: bins.reduce((t, b) => t + b.n, 0) };
    });
    const title = "Peak widths: " + (files.map((f) => f.label).join(", ") || "no files");
    if (!files.length) return emptySVG(W, title);

    // Small multiples, one panel per file, on shared axes: bars never hide each other,
    // and 1 file or 10 draw the same way. Each panel's swatch and label are its legend.
    const edges = files.flatMap((f) => f.bins.flatMap((b) => [b.from, b.to])).map((v) => Math.max(v, 1));
    let lo = edges.length ? Math.min(...edges) : 10;
    let hi = edges.length ? Math.max(...edges) : 1000;
    if (hi / lo < 2) { lo /= 2; hi *= 2; } // one width only (e.g. a file with one peak)
    const value = (f, n) => (asCount ? n : f.total ? n / f.total : 0);
    const yTicks = niceTicks(Math.max(0, ...files.flatMap((f) => f.bins.map((b) => value(f, b.n)))), asCount);
    const yTop = yTicks[yTicks.length - 1];

    const left = 64, right = 16, top = 8, titleH = 18, gap = 12, bottom = 44;
    const plotH = files.length === 1 ? 140 : 80;
    const plotW = W - left - right;
    const H = top + files.length * (titleH + plotH + gap) - gap + bottom;
    const X = (v) => left + ((Math.log10(Math.max(v, 1)) - Math.log10(lo)) / Math.log10(hi / lo)) * plotW;
    const xTicks = dropCrowded(logTicks(lo, hi), X);

    let out = svgOpen(W, H, title);
    files.forEach((f, i) => {
      const py = top + i * (titleH + plotH + gap);
      const base = py + titleH + plotH;
      const Y = (v) => base - (v / yTop) * plotH;
      out += swatch(i, left, py + 3) + text(left + 14, py + 12, fitText(f.label, plotW - 140), "", 'font-weight="600"') +
        text(W - right, py + 12, "n = " + fmtInt(f.total), "end", 'fill="#555"');
      for (const t of xTicks) out += line(X(t), py + titleH, X(t), base, "#e6e6e6");
      for (const t of yTicks) {
        if (t > 0) out += line(left, Y(t), W - right, Y(t), "#f0f0f0");
        out += text(left - 6, Y(t) + 4, fmtY(t, yTicks, asCount), "end", 'fill="#555"');
      }
      for (const b of f.bins) {
        if (!(b.n > 0)) continue;
        let x0 = X(b.from), x1 = X(b.to);
        if (x1 - x0 < 3) { const c = (x0 + x1) / 2; x0 = c - 1.5; x1 = c + 1.5; }
        else { x0 += 0.5; x1 -= 0.5; }
        const tip = `${f.label}: ${fmtInt(b.from)}–${fmtInt(b.to)} bp, ${fmtInt(b.n)} peaks (${pct(b.n, f.total)})`;
        out += bar(i, x0, Y(value(f, b.n)), x1 - x0, base - Y(value(f, b.n)), tip);
      }
      out += line(left, base, W - right, base, "#333");
    });

    const axisY = H - bottom;
    out += logMinorTicks(lo, hi, X, axisY);
    for (const t of xTicks) out += line(X(t), axisY, X(t), axisY + 5, "#333") + text(X(t), axisY + 17, fmtBp(t), "middle");
    out += text(left + plotW / 2, H - 8, "Peak width (bp, log scale)", "middle", 'font-weight="600"');
    out += yTitle(top + (axisY - top) / 2, asCount ? "Peaks" : "% of each file's peaks");
    return out + "</svg>";
  };

  PeakPeek.chromBarsSVG = function (summaries, { width, y = "fraction" } = {}) {
    const W = chartWidth(width);
    const asCount = y === "count";
    // Files line up by name without a leading "chr", with M and MT the same (ADR-0007).
    const files = (summaries || []).map((s, i) => {
      const counts = new Map(), written = new Map();
      for (const c of (s && s.perChrom) || []) {
        if (!c || !isFinite(c.n)) continue;
        const key = chromKey(c.chrom);
        counts.set(key, (counts.get(key) || 0) + c.n);
        if (!written.has(key)) written.set(key, String(c.chrom));
      }
      let total = 0;
      for (const n of counts.values()) total += n;
      return { label: fileLabel(s, i), counts, written, total };
    });
    const title = "Peaks per chromosome: " + (files.map((f) => f.label).join(", ") || "no files");
    if (!files.length) return emptySVG(W, title);

    const keys = alignChroms(files.map((f) => [...f.counts.keys()]));
    // Shown as written when the files agree on every spelling; otherwise all without "chr".
    const spelled = keys.map((k) => new Set(files.filter((f) => f.written.has(k)).map((f) => f.written.get(k))));
    const names = spelled.every((s) => s.size === 1) ? spelled.map((s) => [...s][0]) : keys;
    const value = (f, n) => (asCount ? n : f.total ? n / f.total : 0);
    const yTicks = niceTicks(Math.max(0, ...files.flatMap((f) => [...f.counts.values()].map((n) => value(f, n)))), asCount);
    const yTop = yTicks[yTicks.length - 1];

    const left = 64, right = 16, plotH = 220;
    const plotW = W - left - right;
    const legend = legendSVG(files, left, 8, plotW);
    const top = 8 + legend.height + 10;
    const groupW = plotW / Math.max(keys.length, 1);
    const labelPx = Math.max(0, ...names.map((n) => n.length * CHAR_PX));
    const rotate = labelPx > groupW - 4;
    const bottom = (rotate ? 14 + labelPx * 0.72 : 20) + 24;
    const H = top + plotH + bottom;
    const base = top + plotH;
    const Y = (v) => base - (v / yTop) * plotH;
    const barW = (groupW * 0.8) / files.length;

    let out = svgOpen(W, H, title) + legend.svg;
    for (const t of yTicks) {
      if (t > 0) out += line(left, Y(t), W - right, Y(t), "#eee");
      out += text(left - 6, Y(t) + 4, fmtY(t, yTicks, asCount), "end", 'fill="#555"');
    }
    keys.forEach((k, g) => {
      const gx = left + g * groupW + groupW * 0.1;
      out += `<g data-chrom="${esc(k)}">`;
      files.forEach((f, i) => {
        const n = f.counts.get(k) || 0;
        if (!(n > 0)) return;
        const tip = `${f.label}, ${f.written.get(k)}: ${fmtInt(n)} peaks (${pct(n, f.total)})`;
        out += bar(i, gx + i * barW, Y(value(f, n)), Math.max(barW - (barW > 4 ? 1 : 0), 0.5), base - Y(value(f, n)), tip);
      });
      const cx = left + (g + 0.5) * groupW;
      out += rotate
        ? text(cx + 3, base + 12, names[g], "end", `transform="rotate(-45 ${num(cx + 3)} ${num(base + 12)})"`)
        : text(cx, base + 15, names[g], "middle");
      out += "</g>";
    });
    out += line(left, base, W - right, base, "#333");
    out += text(left + plotW / 2, H - 8, "Chromosome", "middle", 'font-weight="600"');
    out += yTitle(top + plotH / 2, asCount ? "Peaks" : "% of each file's peaks");
    return out + "</svg>";
  };

  // The name files are aligned by: no leading "chr", and MT is M (ADR-0007).
  function chromKey(chrom) {
    const bare = String(chrom).replace(/^chr/i, "");
    return /^(M|MT)$/i.test(bare) ? "M" : bare;
  }

  // One order for every file's chromosomes, keeping each file's own (natural) order. A
  // chromosome goes between its file's neighbours that are already placed, and among
  // other files' chromosomes there, by name. "other" is always last.
  function alignChroms(lists) {
    const order = [];
    for (const keys of lists) {
      keys.forEach((k, j) => {
        if (k === "other" || order.includes(k)) return;
        const prev = keys.slice(0, j).reverse().find((p) => order.includes(p));
        const next = keys.slice(j + 1).find((n) => n !== "other" && order.includes(n));
        let at = prev === undefined ? 0 : order.indexOf(prev) + 1;
        const end = next === undefined ? order.length : order.indexOf(next);
        while (at < end && compareKeys(order[at], k) < 0) at++;
        order.splice(at, 0, k);
      });
    }
    if (lists.some((keys) => keys.includes("other"))) order.push("other");
    return order;
  }

  // Numbers, then X, Y, M, then anything else by name. Only breaks ties for alignChroms.
  function compareKeys(a, b) {
    const rank = (k) => (/^\d+$/.test(k) ? [0, +k] : ["X", "Y", "M"].includes(k.toUpperCase()) ? [1, "XYM".indexOf(k.toUpperCase())] : [2, 0]);
    const [ra, na] = rank(a), [rb, nb] = rank(b);
    return ra - rb || na - nb || (a < b ? -1 : a > b ? 1 : 0);
  }

  // Swatch, label and n per file, flowing into rows.
  function legendSVG(files, x0, y0, maxW) {
    let x = x0, y = y0, svg = "";
    files.forEach((f, i) => {
      const extra = "n = " + fmtInt(f.total);
      const label = fitText(f.label, maxW - 26 - extra.length * CHAR_PX);
      const w = 14 + (label.length + extra.length) * CHAR_PX + 6 + 16;
      if (x > x0 && x + w > x0 + maxW) { x = x0; y += 18; }
      svg += swatch(i, x, y + 1) + `<text x="${num(x + 14)}" y="${num(y + 10)}">${esc(label)}` +
        `<tspan dx="6" fill="#555">${esc(extra)}</tspan></text>`;
      x += w;
    });
    return { svg, height: y - y0 + 14 };
  }

  // 0 up to a round number at or above max, in about four steps.
  function niceTicks(max, integers) {
    if (!(max > 0)) max = integers ? 1 : 0.1;
    let step = Math.pow(10, Math.floor(Math.log10(max / 4)));
    for (const m of [1, 2, 5, 10]) {
      if (max / (step * m) <= 4) { step *= m; break; }
    }
    if (integers) step = Math.max(1, Math.round(step));
    const ticks = [];
    for (let i = 0; i <= Math.ceil(max / step - 1e-9); i++) ticks.push(i * step);
    return ticks;
  }

  // Powers of ten inside [lo, hi]; with fewer than three, 1-2-5, then every integer multiple.
  function logTicks(lo, hi) {
    let ticks = [];
    for (const mults of [[1], [1, 2, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]]) {
      ticks = [];
      for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
        for (const m of mults) {
          const v = m * Math.pow(10, e);
          if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) ticks.push(v);
        }
      }
      if (ticks.length >= 3) break;
    }
    return ticks;
  }

  // Unlabelled ticks at 2–9 × each power of ten, so the axis reads as logarithmic.
  function logMinorTicks(lo, hi, X, axisY) {
    let out = "";
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      for (let m = 2; m <= 9; m++) {
        const v = m * Math.pow(10, e);
        if (v > lo && v < hi) out += line(X(v), axisY, X(v), axisY + 3, "#888");
      }
    }
    return out;
  }

  function dropCrowded(ticks, X) {
    const kept = [];
    for (const t of ticks) {
      const prev = kept[kept.length - 1];
      if (prev === undefined || X(t) - X(prev) >= (fmtBp(t).length + fmtBp(prev).length) * CHAR_PX * 0.5 + 8) kept.push(t);
    }
    return kept;
  }

  function svgOpen(w, h, title) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
      `role="img" aria-label="${esc(title)}" font-family="${FONT}" font-size="11" fill="#222">` +
      `<title>${esc(title)}</title><rect width="${w}" height="${h}" fill="#fff"/>`;
  }

  function emptySVG(w, title) {
    return svgOpen(w, 60, title) + text(w / 2, 34, "No files to chart", "middle", 'fill="#555"') + "</svg>";
  }

  function paint(i) {
    const c = PALETTE[i % PALETTE.length];
    return i < PALETTE.length ? `fill="${c}"` : `fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="1"`;
  }

  function bar(i, x, y, w, h, tip) {
    return `<rect data-file="${i}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${paint(i)}>` +
      `<title>${esc(tip)}</title></rect>`;
  }

  function swatch(i, x, y) {
    return `<rect x="${num(x)}" y="${num(y)}" width="10" height="10" ${paint(i)}/>`;
  }

  function line(x1, y1, x2, y2, colour) {
    return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${colour}" stroke-width="1"/>`;
  }

  function text(x, y, content, anchor, attrs) {
    return `<text x="${num(x)}" y="${num(y)}"${anchor ? ` text-anchor="${anchor}"` : ""}${attrs ? " " + attrs : ""}>${esc(content)}</text>`;
  }

  function yTitle(cy, content) {
    return text(14, cy, content, "middle", `font-weight="600" transform="rotate(-90 14 ${num(cy)})"`);
  }

  function chartWidth(width) {
    const w = Math.round(Number(width));
    return isFinite(w) && w > 0 ? Math.max(w, MIN_WIDTH) : DEFAULT_WIDTH;
  }

  function fileLabel(s, i) {
    return s && s.label != null && String(s.label) !== "" ? String(s.label) : "file " + (i + 1);
  }

  function fitText(s, px) {
    const max = Math.max(2, Math.floor(px / CHAR_PX));
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // A coordinate to one decimal; never "NaN" in the output.
  function num(v) {
    return isFinite(v) ? String(Math.round(v * 10) / 10) : "0";
  }

  function fmtInt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function fmtBp(v) {
    const [d, s] = v >= 1e6 ? [1e6, "M"] : v >= 1e3 ? [1e3, "k"] : [1, ""];
    return +(v / d).toPrecision(3) + s;
  }

  function fmtY(v, ticks, asCount) {
    if (asCount) return fmtInt(v);
    const step = ticks[1] - ticks[0];
    const decimals = Math.max(0, Math.ceil(-Math.log10(step * 100) - 1e-9));
    return (v * 100).toFixed(decimals) + "%";
  }

  function pct(n, total) {
    return total ? ((100 * n) / total).toFixed(1) + "%" : "0%";
  }
})(window.PeakPeek);
