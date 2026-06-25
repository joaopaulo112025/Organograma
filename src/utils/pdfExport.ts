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

export async function exportToPDF(elementId: string, projectName: string, onLoadStatus: (status: 'idle' | 'generating' | 'success' | 'error') => void) {
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
    // 1. Temporarily prepare the element for pristine rendering
    const originalTransform = element.style.transform;
    const originalWidth = element.style.width;
    const originalHeight = element.style.height;

    // Reset transform (zoom/pan) during capture to get the full resolution/accurate coordinates
    element.style.transform = 'none';
    
    const scrollWidth = element.scrollWidth;
    const scrollHeight = element.scrollHeight;

    // Call html2canvas with optimal options for high resolution print
    const canvas = await html2canvas(element, {
      scale: 2, // Retains high crispness for small text
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#f8fafc', // Same as app background
      width: scrollWidth,
      height: scrollHeight,
      windowWidth: scrollWidth + 200,
      windowHeight: scrollHeight + 200,
      onclone: (clonedDoc) => {
        // Monkeypatch cloned context's window to prevent sub-element oklch failures
        const clonedWin = clonedDoc.defaultView;
        if (clonedWin) {
          applyComputedStyleMonkeypatch(clonedWin);
        }

        const clonedEl = clonedDoc.getElementById(elementId);
        if (clonedEl) {
          clonedEl.style.transform = 'none';
          clonedEl.style.width = `${scrollWidth}px`;
          clonedEl.style.height = `${scrollHeight}px`;
        }
      }
    });

    // Restore original styles
    element.style.transform = originalTransform;
    element.style.width = originalWidth;
    element.style.height = originalHeight;

    // Restore main getComputedStyle
    if (restoreMainPatch) restoreMainPatch();

    const imgData = canvas.toDataURL('image/png');
    
    // Determine page orientation based on aspect ratio
    const widthMm = (canvas.width * 25.4) / (96 * 2); // converts px depth to mm
    const heightMm = (canvas.height * 25.4) / (96 * 2);
    
    const orientation = widthMm > heightMm ? 'l' : 'p';
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: [Math.max(widthMm + 40, 297), Math.max(heightMm + 40, 210)] // ensure at least A4 landscape or fit appropriately
    });

    // Add visual header/title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(`Organograma Corporativo - ${projectName}`, 20, 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Prospecção de Contatos Corporativos`, 20, 21);

    // Draw the organizational chart image
    pdf.addImage(imgData, 'PNG', 20, 28, widthMm, heightMm);

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
