import Stats from "./libs/Stats";
import Encoder from "./passes/Encoder";
import { GPUResourceType, GPUSource } from "./types/types";
import { UniformBuffer, UniformList } from "./UniformBuffer";

export class Composer {
  passes: Pass[];
  encoder: Encoder;
  stats?: Stats;

  constructor(device: GPUDevice, debug?: boolean) {
    this.passes = [];
    this.encoder = new Encoder(device, debug);

    if (debug) {
      this.stats = new Stats("comp").showPanel(1);
    }
  }

  addPass(pass: Pass) {
    this.passes.push(pass);
    return pass;
  }

  getLastPassIndex() {
    return this.passes.length - 1;
  }

  getPassOutput(index: number, name: string) {
    return this.passes[index].outputs.get(name);
  }

  removePass(pass: Pass) {
    this.passes.splice(this.passes.indexOf(pass), 1);
  }

  update() {
    this.stats?.begin();

    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i];
      pass.update(this.encoder);
    }

    this.stats?.end();

    this.encoder.submit(this.stats);
  }
}

export class Pass {
  inputs: Map<string, GPUSource>;
  outputs: Map<string, GPUResourceType>;
  device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
    this.inputs = new Map();
    this.outputs = new Map();
  }

  update(encode: Encoder, debug?: boolean) {}
}

export class ShaderPass extends Pass {
  shader: string;
  uniformBuffer: UniformBuffer;
  uniforms: UniformList<any>;

  constructor(device: GPUDevice, shader: string, uniforms: UniformList<any>) {
    super(device);
    this.shader = shader;
    this.uniforms = uniforms;
    this.uniformBuffer = new UniformBuffer(this.device, uniforms);
  }
}
