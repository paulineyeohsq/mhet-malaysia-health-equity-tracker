/**
 * Zero-dependency SVG -> PNG export. Recharts renders to a plain <svg>, so
 * we can serialize it directly, draw it into a canvas via an Image, and
 * read the canvas back out as a PNG data URL — no html2canvas/dom-to-image
 * dependency needed. Only works for pure-SVG charts (BarRankingCard,
 * LineChartCard); Leaflet-based maps mix in cross-origin raster tiles that
 * would taint the canvas, so ChoroplethMap intentionally does not offer
 * PNG export via this utility.
 */

function inlineComputedFont(svg: SVGSVGElement): void {
  // Recharts text elements rely on the page's CSS font stack, which isn't
  // captured when the SVG is serialized standalone — set a safe explicit
  // fallback so exported text doesn't silently disappear.
  svg.querySelectorAll("text").forEach((el) => {
    if (!el.getAttribute("font-family")) {
      el.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
    }
  });
}

export function svgToPngDataUrl(svg: SVGSVGElement, background = "#ffffff", scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    inlineComputedFont(clone);

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterize chart SVG"));
    };
    img.src = url;
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
