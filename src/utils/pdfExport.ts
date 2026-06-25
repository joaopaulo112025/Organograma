import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Mathematical conversion of OKLCH to sRGB to bypass html2canvas crashes on CSS level 4 colors
function convertOklchToRgb(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return colorStr;
  
  if (!colorStr.toLowerCase().includes('oklch')) {
    return colorStr;
  }

  return colorStr.replace(/oklch\(([^)]+)\)/gi, (fullMatch, innerContent) => {
    try {
      // Split by space, comma, or slashes, and filter out extra empty strings
      const tokens = innerContent.trim().split(/[\s,/\s]+/).filter(Boolean);
      if (tokens.length < 3) return fullMatch;

      const lStr = tokens[0];
      const cStr = tokens[1];
      const hStr = tokens[2];
      const aStr = tokens[3] || '1';

      let l = parseFloat(lStr);
      if (lStr.endsWith('%')) l /= 100;

      let c = parseFloat(cStr);
      if (cStr.endsWith('%')) c /= 100;

      let h = parseFloat(hStr);

      let alpha = parseFloat(aStr);
      if (aStr.endsWith('%')) alpha /= 100;
      if (isNaN(alpha)) alpha = 1;

      // OKLAB conversion
      const hRad = (h * Math.PI) / 180;
      const a = c * Math.cos(hRad);
      const b = c * Math.sin(hRad);

      const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

      const l3 = l_ * l_ * l_;
      const m3 = m_ * m_ * m_;
      const s3 = s_ * s_ * s_;

      const r_ = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      const g_ = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      const b_ = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

      const toSRGB = (x: number) => {
        const clamped = Math.max(0, Math.min(1, x));
        return clamped <= 0.0031308
          ? 12.92 * clamped
          : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
      };

      const r = Math.round(toSRGB(r_) * 255);
      const g = Math.round(toSRGB(g_) * 255);
      const blue = Math.round(toSRGB(b_) * 255);

      if (alpha === 1) {
        return `rgb(${r}, ${g}, ${blue})`;
      } else {
        return `rgba(${r}, ${g}, ${blue}, ${alpha})`;
      }
    } catch (e) {
      console.warn("Failing conversion of oklch content:", innerContent, e);
      return fullMatch;
    }
  });
}

// Mathematical conversion of OKLAB to sRGB to bypass html2canvas crashes
function convertOklabToRgb(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return colorStr;
  
  if (!colorStr.toLowerCase().includes('oklab')) {
    return colorStr;
  }

  return colorStr.replace(/oklab\(([^)]+)\)/gi, (fullMatch, innerContent) => {
    try {
      const tokens = innerContent.trim().split(/[\s,/\s]+/).filter(Boolean);
      if (tokens.length < 3) return fullMatch;

      const lStr = tokens[0];
      const aStrVal = tokens[1];
      const bStrVal = tokens[2];
      const alphaStr = tokens[3] || '1';

      let l = parseFloat(lStr);
      if (lStr.endsWith('%')) l /= 100;

      let a = parseFloat(aStrVal);
      if (aStrVal.endsWith('%')) a /= 100;

      let b = parseFloat(bStrVal);
      if (bStrVal.endsWith('%')) b /= 100;

      let alpha = parseFloat(alphaStr);
      if (alphaStr.endsWith('%')) alpha /= 100;
      if (isNaN(alpha)) alpha = 1;

      const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

      const l3 = l_ * l_ * l_;
      const m3 = m_ * m_ * m_;
      const s3 = s_ * s_ * s_;

      const r_ = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      const g_ = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      const b_ = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

      const toSRGB = (x: number) => {
        const clamped = Math.max(0, Math.min(1, x));
        return clamped <= 0.0031308
          ? 12.92 * clamped
          : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
      };

      const r = Math.round(toSRGB(r_) * 255);
      const g = Math.round(toSRGB(g_) * 255);
      const blue = Math.round(toSRGB(b_) * 255);

      if (alpha === 1) {
        return `rgb(${r}, ${g}, ${blue})`;
      } else {
        return `rgba(${r}, ${g}, ${blue}, ${alpha})`;
      }
    } catch (e) {
      console.warn("Failing conversion of oklab content:", innerContent, e);
      return fullMatch;
    }
  });
}

// Convert all modern/unsupported color spaces to cross-browser friendly format
function convertModernColorsToRgb(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return colorStr;
  let result = colorStr;
  result = convertOklchToRgb(result);
  result = convertOklabToRgb(result);
  return result;
}

// Proxies getComputedStyle for an target window to intercept oklch styles
function applyComputedStyleMonkeypatch(targetWindow: Window & typeof globalThis) {
  if (!targetWindow) return null;
  const originalGetComputedStyle = targetWindow.getComputedStyle;
  
  targetWindow.getComputedStyle = function (el: Element, pseudoElt?: string): CSSStyleDeclaration {
    const style = originalGetComputedStyle(el, pseudoElt);
    
    // Return a Proxy of the Style Declaration to handle direct property accesses (e.g. style.backgroundColor)
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return function (propertyName: string): string {
            const val = target.getPropertyValue(propertyName);
            return convertModernColorsToRgb(val);
          };
        }
        
        // Retrieve the property directly from target to avoid invoking internal getters on the proxy wrapper
        const val = target[prop as keyof CSSStyleDeclaration];
        if (typeof val === 'function') {
          // Bind native functions to target to prevent "Illegal invocation" exceptions
          return (val as Function).bind(target);
        }
        if (typeof val === 'string') {
          return convertModernColorsToRgb(val);
        }
        return val;
      }
    }) as unknown as CSSStyleDeclaration;
  };

  return () => {
    targetWindow.getComputedStyle = originalGetComputedStyle;
  };
}

export async function exportToPDF(
  elementId: string,
  projectName: string,
  coords: Record<string, { x: number; y: number }>,
  onLoadStatus: (status: 'idle' | 'generating' | 'success' | 'error') => void
) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found.`);
    onLoadStatus('error');
    return;
  }

  onLoadStatus('generating');

  // Monkeypatch main window's getComputedStyle during capture
  const restoreMainPatch = applyComputedStyleMonkeypatch(window);

  try {
    // 1. Calculate the actual bounding box of the nodes to crop out unnecessary empty whitespace
    const coordsList = Object.values(coords);
    const cardWidth = 260;
    const cardHeight = 280; // Safer height calculation to ensure taller cards are never clipped at the bottom!

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    if (coordsList.length > 0) {
      for (const pos of coordsList) {
        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x + cardWidth > maxX) maxX = pos.x + cardWidth;
        if (pos.y + cardHeight > maxY) maxY = pos.y + cardHeight;
      }
    } else {
      minX = 0;
      minY = 0;
      maxX = 1200;
      maxY = 800;
    }

    // Add visual padding around the extreme cards to prevent line/text clipping
    const padding = 65;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    // Temporarily prepare the element for pristine high-res rendering
    const originalTransform = element.style.transform;
    const originalWidth = element.style.width;
    const originalHeight = element.style.height;

    // Reset transform (zoom/pan) during capture to get full resolution/accurate scale
    element.style.transform = 'none';
    element.style.width = '5000px';
    element.style.height = '3500px';

    // Call html2canvas with optimal options for high resolution print
    const canvas = await html2canvas(element, {
      scale: 2, // Retains extreme crispness for high density prints
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#f8fafc', // Clean slate-50 background for corporate layouts
      x: minX,
      y: minY,
      width: width,
      height: height,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 5000,
      windowHeight: 3500,
      onclone: (clonedDoc) => {
        // Monkeypatch cloned context's window to prevent sub-element oklch failures
        const clonedWin = clonedDoc.defaultView;
        if (clonedWin) {
          applyComputedStyleMonkeypatch(clonedWin);
        }

        // Inject high fidelity printing CSS overrides to prevent truncation and hide editing actions
        const style = clonedDoc.createElement('style');
        style.innerHTML = `
          .pdf-hide {
            display: none !important;
          }
          /* Override all font families to a safe high-fidelity system sans-serif font */
          * {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          }
          /* Prevent email/phone/text truncation on PDF - wrap beautifully */
          .truncate, [class*="truncate"] {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            word-break: break-all !important;
            overflow-wrap: break-word !important;
            display: inline-block !important;
            max-width: 195px !important; /* Allow wrapping while leaving space for icons */
          }
          /* Ensure line-clamp doesn't fail on PDF - let names wrap */
          .line-clamp-1 {
            display: block !important;
            -webkit-line-clamp: unset !important;
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            word-break: break-word !important;
          }
          /* Make monospace text (email, phone) slightly smaller and cleaner in PDF */
          .font-mono {
            font-size: 10px !important;
            line-height: 1.2 !important;
            color: #334155 !important; /* slate-700 for maximum readability */
          }
          /* Ensure cards can slightly expand if contact lines wrap */
          [id^="org-node-card-"] {
            height: auto !important;
            min-height: 195px !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05) !important;
            filter: none !important;
            transition: none !important;
            transform: none !important;
          }
          /* Mapping standard Tailwind classes to exact RGB values to prevent html2canvas oklch parsing glitches */
          .border-slate-100 {
            border-color: #f1f5f9 !important;
          }
          .border-slate-200 {
            border-color: #e2e8f0 !important;
          }
          .bg-slate-50 {
            background-color: #f8fafc !important;
          }
          .bg-slate-100 {
            background-color: #f1f5f9 !important;
          }
          .text-slate-800 {
            color: #1e293b !important;
          }
          .text-slate-700 {
            color: #334155 !important;
          }
          .text-slate-600 {
            color: #475569 !important;
          }
          .text-slate-500 {
            color: #64748b !important;
          }
          .text-slate-400 {
            color: #94a3b8 !important;
          }
          .bg-indigo-50 {
            background-color: #e0e7ff !important;
          }
          .text-indigo-600 {
            color: #4f46e5 !important;
          }
          /* Solid connections and SVG elements rendering */
          svg path {
            stroke-opacity: 1 !important;
            vector-effect: non-scaling-stroke !important;
          }
        `;
        clonedDoc.head.appendChild(style);

        const clonedEl = clonedDoc.getElementById(elementId);
        if (clonedEl) {
          // Reset transform scale and dimensions to match original board size flat
          clonedEl.style.transform = 'none';
          clonedEl.style.width = '5000px';
          clonedEl.style.height = '3500px';
        }
      }
    });

    // Restore original styles on main DOM
    element.style.transform = originalTransform;
    element.style.width = originalWidth;
    element.style.height = originalHeight;

    // Restore main getComputedStyle
    if (restoreMainPatch) restoreMainPatch();

    const imgData = canvas.toDataURL('image/png');
    
    // Determine page dimensions based on the millimeter equivalent size of the bounding box
    const widthMm = (width * 25.4) / 96; 
    const heightMm = (height * 25.4) / 96;

    // Enforce high quality landscape-preferred document sizes
    const orientation = widthMm > heightMm ? 'l' : 'p';
    const pdfWidth = Math.max(widthMm + 40, 297); // ensure at least A4 size (297mm)
    const pdfHeight = Math.max(heightMm + 55, 210); // extra vertical space for elegant header/footer

    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    // Calculate elegant center alignments inside the page canvas
    const xOffset = (pdfWidth - widthMm) / 2;
    const availableHeightForImage = pdfHeight - 55;
    const yOffset = 30 + Math.max(0, (availableHeightForImage - heightMm) / 2);

    // Render professional corporate header decoration
    pdf.setDrawColor(79, 70, 229); // indigo-600 accent color
    pdf.setLineWidth(1.2);
    pdf.line(20, 25, pdfWidth - 20, 25);

    // Left title block
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.text(`Organograma Corporativo - ${projectName}`, 20, 16);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(100, 116, 139); // slate-500
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    pdf.text(`Gerado em: ${dateStr} às ${timeStr} • Mapeamento de Decisores`, 20, 21);

    // Right brand label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(79, 70, 229); // indigo-600
    pdf.text("ORGANOGRAMA INTELIGENTE B2B", pdfWidth - 80, 21);

    // Draw the organizational chart image with high fidelity centering
    pdf.addImage(imgData, 'PNG', xOffset, yOffset, widthMm, heightMm);

    // Render beautiful footer line and disclaimer
    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.setLineWidth(0.5);
    pdf.line(20, pdfHeight - 18, pdfWidth - 20, pdfHeight - 18);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text("Este documento contém informações estruturais confidenciais de prospecção comercial.", 20, pdfHeight - 12);
    pdf.text("Página 1 de 1", pdfWidth - 38, pdfHeight - 12);

    // Save output
    const rawName = projectName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    pdf.save(`organograma-${rawName || 'projeto'}.pdf`);
    onLoadStatus('success');
  } catch (err) {
    console.error('Error generating PDF:', err);
    if (restoreMainPatch) restoreMainPatch();
    onLoadStatus('error');
  }
}
