/**
 * 测试用的最小 2D Canvas：只记录状态，不真正绘制。
 * 用来在 Node 里跑完每个模板的绘制代码（捕获异常 / 非法坐标 / 空图片）。
 */

const DEFAULT_STATE = {
  font: '10px sans-serif',
  fillStyle: '#000000',
  strokeStyle: '#000000',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  lineDashOffset: 0,
  miterLimit: 10,
  textAlign: 'start',
  textBaseline: 'alphabetic',
  direction: 'ltr',
  letterSpacing: '0px',
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low',
  filter: 'none'
};

const CHECKED = new Set(['moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'translate', 'scale', 'rotate', 'drawImage']);

function fontSize(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

export function fakeContext(canvas, log) {
  const state = { ...DEFAULT_STATE };
  const stack = [];
  let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  const methods = {
    save() {
      stack.push({ state: { ...state }, transform: { ...transform } });
    },
    restore() {
      const s = stack.pop();
      if (!s) return;
      Object.assign(state, s.state);
      transform = s.transform;
    },
    getTransform() {
      return { ...transform };
    },
    setTransform(a, b, c, d, e, f) {
      transform = typeof a === 'object' ? { ...a } : { a, b, c, d, e, f };
    },
    measureText(text) {
      const size = fontSize(state.font);
      const width = [...String(text)].length * size * 0.56;
      return {
        width,
        actualBoundingBoxAscent: size * 0.72,
        actualBoundingBoxDescent: size * 0.2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: width,
        fontBoundingBoxAscent: size * 0.9,
        fontBoundingBoxDescent: size * 0.25
      };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createPattern() {
      return {};
    },
    getImageData(x, y, w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) };
    },
    getLineDash() {
      return [];
    }
  };

  return new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'canvas') return canvas;
        if (key in methods) return methods[key];
        if (key in state) return state[key];
        return (...args) => {
          if (CHECKED.has(key)) {
            const nums = key === 'drawImage' || key === 'fillText' || key === 'strokeText' ? args.slice(1) : args;
            if (key === 'drawImage' && !args[0]) log.push(`drawImage(${args[0]})`);
            if (nums.some((v) => typeof v === 'number' && !Number.isFinite(v))) log.push(`${key}(${args.map(String).join(', ')})`);
          }
          if (key === 'fillText' || key === 'strokeText') log.texts.push(String(args[0]));
        };
      },
      set(_, key, value) {
        state[key] = value;
        return true;
      }
    }
  );
}

/** 替代 OffscreenCanvas；所有由它创建的上下文共用同一个问题记录 */
export function installFakeCanvas() {
  const log = [];
  log.texts = [];
  class FakeCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.ctx = null;
    }
    getContext() {
      if (!this.ctx) this.ctx = fakeContext(this, log);
      return this.ctx;
    }
  }
  globalThis.OffscreenCanvas = FakeCanvas;
  return { FakeCanvas, log };
}
