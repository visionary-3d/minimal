import Stats from "./libs/Stats";
import Encoder from "./passes/Encoder";
import { Shader } from "./passes/Shader";
import { ReferenceObject, RESOURCE_TYPE } from "./shaders/Parsing";
import { GPUResourceType, GPUSource } from "./types/types";
import { UniformBuffer, UniformList } from "./UniformBuffer";

export class Composer {
  shaders: Shader[];
  encoder: Encoder;
  stats?: Stats;

  constructor(device: GPUDevice, debug?: boolean) {
    this.shaders = [];
    this.encoder = new Encoder(device, debug);

    if (debug) {
      this.stats = new Stats("COMP").showPanel(1);
    }
  }

  setInputs() {
    for (let i = 0; i < this.shaders.length; i++) {
      const pass = this.shaders[i];
      const resources = pass.parsed.resources;
      const referenceResources = resources.filter((r) => r.resourceType === RESOURCE_TYPE.REF);
      const inputs: Record<string, GPUSource> = {};
      for (let i = 0; i < referenceResources.length; i++) {
        const reference = referenceResources[i] as ReferenceObject;

        const node = this.shaders.find((s) => s.name === reference.node);
        if (!node) {
          throw Error(
            `Composer.init: Reference with shader name ${reference.node}, doesn't exist in the composer shader list. You'll have to add a shader with that name to the composer!`
          );
        }

        if (!node.outputs.has(reference.ref)) {
          throw Error(
            `Composer.init: Reference resource with name: ${reference.ref} could not be found in shader with name: ${node.name}`
          );
        }

        inputs[reference.name] = { shader: node, name: reference.ref };
      }

      pass.setInputs(inputs);
    }
  }

  addShader(shader: Shader) {
    this.shaders.push(shader);
    return shader;
  }

  getShaderOutput(index: number, name: string) {
    return this.shaders[index].outputs.get(name);
  }

  removeShader(shader: Shader) {
    this.shaders.splice(this.shaders.indexOf(shader), 1);
  }

  update() {
    this.stats?.begin();

    for (let i = 0; i < this.shaders.length; i++) {
      const shader = this.shaders[i];
      shader.update(this.encoder);
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
