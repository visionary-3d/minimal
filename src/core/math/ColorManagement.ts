import { SRGBColorSpace, LinearSRGBColorSpace } from './constants.js';

export function SRGBToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

export function LinearToSRGB(c: number): number {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}

const FN: { [key: string]: { [key: string]: (c: number) => number } } = {
  [SRGBColorSpace]: { [LinearSRGBColorSpace]: SRGBToLinear },
  [LinearSRGBColorSpace]: { [SRGBColorSpace]: LinearToSRGB },
};

export const ColorManagement = {
  legacyMode: true,

  get workingColorSpace(): string {
    return LinearSRGBColorSpace;
  },

  set workingColorSpace(colorSpace: string) {
    console.warn('THREE.ColorManagement: .workingColorSpace is readonly.');
  },

  convert(color: { r: number; g: number; b: number }, sourceColorSpace: string, targetColorSpace: string): { r: number; g: number; b: number } {
    if (this.legacyMode || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
      return color;
    }

    if (FN[sourceColorSpace] && FN[sourceColorSpace][targetColorSpace] !== undefined) {
      const fn = FN[sourceColorSpace][targetColorSpace];

      color.r = fn(color.r);
      color.g = fn(color.g);
      color.b = fn(color.b);

      return color;
    }

    throw new Error('Unsupported color space conversion.');
  },

  fromWorkingColorSpace(color: { r: number; g: number; b: number }, targetColorSpace: string): { r: number; g: number; b: number } {
    return this.convert(color, this.workingColorSpace, targetColorSpace);
  },

  toWorkingColorSpace(color: { r: number; g: number; b: number }, sourceColorSpace: string): { r: number; g: number; b: number } {
    return this.convert(color, sourceColorSpace, this.workingColorSpace);
  },
};