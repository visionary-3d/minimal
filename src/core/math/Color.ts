import { clamp, euclideanModulo, lerp } from "./MathUtils";
import { ColorManagement, SRGBToLinear, LinearToSRGB } from "./ColorManagement";
import { SRGBColorSpace } from "./constants";

const _colorKeywords: { [key: string]: number } = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};

const _rgb = { r: 0, g: 0, b: 0 };
const _hslA = { h: 0, s: 0, l: 0 };
const _hslB = { h: 0, s: 0, l: 0 };

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

function toComponents(
  source: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number }
): { r: number; g: number; b: number } {
  target.r = source.r;
  target.g = source.g;
  target.b = source.b;

  return target;
}

class Color extends Array {
  constructor(r?: number | string, g?: number, b?: number) {
    super(3);

    this.r = 1;
    this.g = 1;
    this.b = 1;

    if (g === undefined && b === undefined) {
      // r is THREE.Color, hex or string
      if (r === undefined) return this;

      return this.set(r);
    }

    return this.setRGB(r as number, g as number, b as number);
  }

  get r(): number {
    return this[0];
  }

  set r(r) {
    this[0] = r;
  }

  get g(): number {
    return this[1];
  }

  set g(g) {
    this[1] = g;
  }

  get b(): number {
    return this[2];
  }

  set b(b) {
    this[2] = b;
  }

  set(value: number | Color | string): this {
    if (value && value instanceof Color) {
      this.copy(value as Color);
    } else if (typeof value === "number") {
      this.setHex(value);
    } else if (typeof value === "string") {
      this.setStyle(value);
    }

    return this;
  }

  setScalar(scalar: number): this {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;

    return this;
  }

  setHex(hex: number, colorSpace: any = SRGBColorSpace): this {
    hex = Math.floor(hex);

    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;

    ColorManagement.toWorkingColorSpace(this, colorSpace);

    return this;
  }

  setRGB(r: number, g: number, b: number, colorSpace: any = ColorManagement.workingColorSpace): this {
    this.r = r;
    this.g = g;
    this.b = b;

    ColorManagement.toWorkingColorSpace(this, colorSpace);

    return this;
  }

  setHSL(h: number, s: number, l: number, colorSpace: any = ColorManagement.workingColorSpace): this {
    // h,s,l ranges are in 0.0 - 1.0
    h = euclideanModulo(h, 1);
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);

    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;

      this.r = hue2rgb(q, p, h + 1 / 3);
      this.g = hue2rgb(q, p, h);
      this.b = hue2rgb(q, p, h - 1 / 3);
    }

    ColorManagement.toWorkingColorSpace(this, colorSpace);

    return this;
  }

  setStyle(style: string, colorSpace: any = SRGBColorSpace): this {
    function handleAlpha(string: string | undefined): void {
      if (string === undefined) return;

      if (parseFloat(string) < 1) {
        console.warn("THREE.Color: Alpha component of " + style + " will be ignored.");
      }
    }

    let m;

    if ((m = /^((?:rgb|hsl)a?)\(([^\)]*)\)/.exec(style))) {
      // rgb / hsl

      let color;
      const name = m[1];
      const components = m[2];

      switch (name) {
        case "rgb":
        case "rgba":
          if ((color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components))) {
            // rgb(255,0,0) rgba(255,0,0,0.5)
            this.r = Math.min(255, parseInt(color[1], 10)) / 255;
            this.g = Math.min(255, parseInt(color[2], 10)) / 255;
            this.b = Math.min(255, parseInt(color[3], 10)) / 255;

            ColorManagement.toWorkingColorSpace(this, colorSpace);

            handleAlpha(color[4]);

            return this;
          }

          if ((color = /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components))) {
            // rgb(100%,0%,0%) rgba(100%,0%,0%,0.5)
            this.r = Math.min(100, parseInt(color[1], 10)) / 100;
            this.g = Math.min(100, parseInt(color[2], 10)) / 100;
            this.b = Math.min(100, parseInt(color[3], 10)) / 100;

            ColorManagement.toWorkingColorSpace(this, colorSpace);

            handleAlpha(color[4]);

            return this;
          }

          break;

        case "hsl":
        case "hsla":
          if (
            (color = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(
              components
            ))
          ) {
            // hsl(120,50%,50%) hsla(120,50%,50%,0.5)
            const h = parseFloat(color[1]) / 360;
            const s = parseFloat(color[2]) / 100;
            const l = parseFloat(color[3]) / 100;

            handleAlpha(color[4]);

            return this.setHSL(h, s, l, colorSpace);
          }

          break;
      }
    } else if ((m = /^\#([A-Fa-f\d]+)$/.exec(style))) {
      // hex color

      const hex = m[1];
      const size = hex.length;

      if (size === 3) {
        // #ff0
        this.r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
        this.g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
        this.b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;

        ColorManagement.toWorkingColorSpace(this, colorSpace);

        return this;
      } else if (size === 6) {
        // #ff0000
        this.r = parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255;
        this.g = parseInt(hex.charAt(2) + hex.charAt(3), 16) / 255;
        this.b = parseInt(hex.charAt(4) + hex.charAt(5), 16) / 255;

        ColorManagement.toWorkingColorSpace(this, colorSpace);

        return this;
      }
    }

    if (style && style.length > 0) {
      return this.setColorName(style, colorSpace);
    }

    return this;
  }

  setColorName(style: string, colorSpace = SRGBColorSpace): this {
    // color keywords
    const hex = _colorKeywords[style.toLowerCase()];

    if (hex !== undefined) {
      // red
      this.setHex(hex, colorSpace);
    } else {
      // unknown color
      console.warn("THREE.Color: Unknown color " + style);
    }

    return this;
  }

  clone() {
    return new Color(this.r, this.g, this.b);
  }

  copy(color: Color): this {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;

    return this;
  }

  copySRGBToLinear(color: Color): this {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);

    return this;
  }

  copyLinearToSRGB(color: Color): this {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);

    return this;
  }

  convertSRGBToLinear(): this {
    this.copySRGBToLinear(this);

    return this;
  }

  convertLinearToSRGB(): this {
    this.copyLinearToSRGB(this);

    return this;
  }

  getHex(colorSpace = SRGBColorSpace): number {
    ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);

    return (
      (clamp(_rgb.r * 255, 0, 255) << 16) ^ (clamp(_rgb.g * 255, 0, 255) << 8) ^ (clamp(_rgb.b * 255, 0, 255) << 0)
    );
  }

  getHexString(colorSpace = SRGBColorSpace): string {
    return ("000000" + this.getHex(colorSpace).toString(16)).slice(-6);
  }

  getHSL(
    target: { h: number; s: number; l: number },
    colorSpace = ColorManagement.workingColorSpace
  ): { h: number; s: number; l: number } {
    // h,s,l ranges are in 0.0 - 1.0

    ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);

    const r = _rgb.r,
      g = _rgb.g,
      b = _rgb.b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let hue, saturation;
    const lightness = (min + max) / 2.0;

    if (min === max) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max - min;

      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);

      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        case b:
          hue = (r - g) / delta + 4;
          break;
      }

      if (hue) hue /= 6;
    }

    if (hue) target.h = hue;
    target.s = saturation;
    target.l = lightness;

    return target;
  }

  getRGB(
    target: { r: number; g: number; b: number },
    colorSpace = ColorManagement.workingColorSpace
  ): { r: number; g: number; b: number } {
    ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);

    target.r = _rgb.r;
    target.g = _rgb.g;
    target.b = _rgb.b;

    return target;
  }

  getStyle(colorSpace = SRGBColorSpace): string {
    ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);

    if (colorSpace !== SRGBColorSpace) {
      // Requires CSS Color Module Level 4 (https://www.w3.org/TR/css-color-4/).
      return `color(${colorSpace} ${_rgb.r} ${_rgb.g} ${_rgb.b})`;
    }

    return `rgb(${(_rgb.r * 255) | 0},${(_rgb.g * 255) | 0},${(_rgb.b * 255) | 0})`;
  }

  offsetHSL(h: number, s: number, l: number): this {
    this.getHSL(_hslA);

    _hslA.h += h;
    _hslA.s += s;
    _hslA.l += l;

    this.setHSL(_hslA.h, _hslA.s, _hslA.l);

    return this;
  }

  add(color: Color): this {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;

    return this;
  }

  addColors(color1: Color, color2: Color): this {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;

    return this;
  }

  addScalar(s: number): this {
    this.r += s;
    this.g += s;
    this.b += s;

    return this;
  }

  sub(color: Color): this {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);

    return this;
  }

  multiply(color: Color): this {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;

    return this;
  }

  multiplyScalar(s: number): this {
    this.r *= s;
    this.g *= s;
    this.b *= s;

    return this;
  }

  lerp(color: Color, alpha: number): this {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;

    return this;
  }

  lerpColors(color1: Color, color2: Color, alpha: number): this {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;

    return this;
  }

  lerpHSL(color: Color, alpha: number): this {
    this.getHSL(_hslA);
    color.getHSL(_hslB);

    const h = lerp(_hslA.h, _hslB.h, alpha);
    const s = lerp(_hslA.s, _hslB.s, alpha);
    const l = lerp(_hslA.l, _hslB.l, alpha);

    this.setHSL(h, s, l);

    return this;
  }

  equals(c: Color): boolean {
    return c.r === this.r && c.g === this.g && c.b === this.b;
  }

  fromArray(array: number[], offset = 0): this {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];

    return this;
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;

    return array;
  }

  fromBufferAttribute(attribute: any, index: number): this {
    this.r = attribute.getX(index);
    this.g = attribute.getY(index);
    this.b = attribute.getZ(index);

    return this;
  }

  toJSON(): number {
    return this.getHex();
  }

  *[Symbol.iterator](): IterableIterator<number> {
    yield this.r;
    yield this.g;
    yield this.b;
  }
}

export { Color, SRGBToLinear };
