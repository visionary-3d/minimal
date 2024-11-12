import { Matrix3 } from "../math/Matrix3";
import { Matrix4 } from "../math/Matrix4";
import { Vector2 } from "../math/Vector2";
import { Vector3 } from "../math/Vector3";
import { Vector4 } from "../math/Vector4";

// Pad to 16 byte chunks of 2, 4 (std140 layout)
export const pad2 = (n: number) => n + (n % 2);
export const pad4 = (n: number) => n + ((4 - (n % 4)) % 4);

// convert nested objects into a single array using index without of array.push
const recursiveObjectToArray = (obj: any, array: Array<number>, index: number = 0) => {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = obj[key];
    if (value instanceof Object) {
      index = recursiveObjectToArray(value, array, index);
    } else if (value instanceof Array) {
      for (let j = 0; j < value.length; j++) {
        array[index++] = value[j];
      }
    } else {
      array[index++] = value;
    }
  }
  return index;
};

type UniformPrimitive<T> = T[] | Uniform<T> | Matrix3 | Matrix4 | Vector4 | Vector3 | Vector2 | T;
type UniformReference<T> = UniformPrimitive<T> | Object;

export type UniformList<T> = Record<string, Uniform<T>>;

export class Uniform<T> {
  value: UniformReference<T>;
  readonly array: T[] | number[] | Float32Array;

  constructor(input: UniformReference<T>) {
    this.value = input;

    if (input instanceof Uniform) {
      this.array = new Array(input.array.length);
      this.copy(input);
    } else if (input instanceof Array) {
      // const arrayLength = pretendVec3IsVec4(input.length);
      this.array = new Array<T>(input.length);
      for (let i = 0; i < input.length; i++) {
        this.array[i] = input[i];
      }
    } else if (input instanceof Object) {
      const values = Object.values(input);
      const keys = Object.keys(input);
      const list = {} as UniformList<T>;
      for (let i = 0; i < values.length; i++) {
        list[keys[i]] = new Uniform(values[i]);
      }
      this.value = list;
      this.array = [];
    } else {
      this.array = [input];
    }

    this.update();
  }

  set(value: UniformReference<T>) {
    this.value = value;
    this.update();
  }

  copy(u: Uniform<T>) {
    this.value = u.value;

    for (let i = 0; i < this.array.length; i++) {
      this.array[i] = u.array[i];
    }

    return this;
  }

  update() {
    // copy reference into value

    if (this.value instanceof Uniform) {
      this.copy(this.value);
      return this.array;
    } else if (this.value instanceof Array) {
      for (let i = 0; i < this.value.length; i++) {
        this.array[i] = this.value[i];
      }
      return this.array;
    } else if (this.value instanceof Object) {
      // nothing, because the object is flattened
      // and the references to the uniforms have changed
      // so the update happens at the individual uniforms
      return this.array;
    } else {
      this.array[0] = this.value;
      return this.array;
    }
  }
}
type UniformSize = { number: number };
const calculateUniformSizeRecursive = (uniform: Uniform<any>, size: UniformSize) => {
  const elements = Object.values(uniform.value);
  if (elements[0] instanceof Uniform) {
    const values = Object.values(uniform.value);
    for (let i = 0; i < values.length; i++) {
      const val = values[i] as Uniform<any>;
      calculateUniformSizeRecursive(val, size);
    }
  } else {
    size.number += uniform.array.length;
  }

  return size.number;
};

const flattenUniforms = (uniforms: UniformList<any>, list: UniformList<any> = {}, keyword?: string) => {
  const values = Object.values(uniforms);
  const keys = Object.keys(uniforms);

  for (let i = 0; i < values.length; i++) {
    const u = values[i];
    const uniforms = Object.values(u.value) as Uniform<any>[];
    if (uniforms[0] instanceof Uniform) {
      flattenUniforms(u.value, list, keys[i] + ".");
    } else {
      let name = keys[i];
      if (keyword) {
        name = keyword + name;
      }
      list[name] = u;
    }
  }

  return list;
};

// * This class is inspired by: https://github.com/CodyJasonBennett/four
export class UniformBuffer {
  uniformsArray: Float32Array;
  buffer: GPUBuffer;
  uniforms: UniformList<any>;
  offsets: Float32Array;
  count: number;
  device: GPUDevice;

  constructor(device: GPUDevice, uniforms: UniformList<any>) {
    this.device = device;
    this.uniforms = flattenUniforms(uniforms);
    this.count = this.getUniformBufferElementsCount();
    this.uniformsArray = new Float32Array(this.count);
    this.offsets = this.initOffsets();
    this.buffer = this.initUniformBuffer();
    this.update();
  }

  initUniformBuffer() {
    const device = this.device;

    const uniformBufferSize = this.getUniformBufferSize();

    const uniformBuffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    return uniformBuffer;
  }

  getUniformBufferSize() {
    return this.count * Float32Array.BYTES_PER_ELEMENT;
  }

  getUniformBufferElementsCount() {
    const uniforms = Object.values(this.uniforms);

    let size = 0;
    for (let i = 0; i < uniforms.length; i++) {
      const u = uniforms[i];
      const value = u.array;
      if (value.length == 1) {
        size += 1;
      } else {
        const pad = value.length == 2 ? pad2 : pad4;
        size = pad(size) + pad(value.length);
      }

      // size += u.extraPadding;
    }

    return pad4(size);
  }

  initOffsets = () => {
    const offsets = new Float32Array(Object.keys(this.uniforms).length);
    const values = Object.values(this.uniforms);

    let offset = 0;
    for (let i = 0; i < values.length; i++) {
      const u = values[i];
      const value = u.array;

      offsets[i] = offset;

      if (value.length == 1) {
        offset++;
      } else {
        const pad = value.length <= 2 ? pad2 : pad4;
        const po = pad(offset);
        offsets[i] = po;
        offset = po + value.length;
      }
    }

    return offsets;
  };

  update() {
    const uniforms = Object.values(this.uniforms);

    // Pack buffer
    for (let i = 0; i < uniforms.length; i++) {
      const u = uniforms[i];
      const offset = this.offsets[i];

      // u.update();

      const value = u.array;

      if (value.length == 1) {
        this.uniformsArray[offset] = value[0];
      } else {
        this.uniformsArray.set(value, offset);
      }
    }

    const device = this.device;
    device.queue.writeBuffer(this.buffer, 0, this.uniformsArray.buffer);
  }

  clone() {
    return new UniformBuffer(this.device, this.uniforms);
  }

  destroy() {
    this.buffer.destroy();
  }
}
