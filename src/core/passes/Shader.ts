import { Vector2 } from "../math/Vector2";
import { ShaderPass } from "../Pass";

import {
  BufferObject,
  ComputeShaderMetadata,
  diffShaderMetadata,
  FragmentShaderMetadata,
  getWGSLTypeSize,
  parseShader,
  ReferenceObject,
  RESOURCE_TYPE,
  ResourceBase,
  SamplerObject,
  ShaderMetadata,
  TextureObject,
  UniformObject,
  WildCard,
} from "../shaders/Parsing";
import { GPUSource } from "../types/types";
import { Uniform, UniformBuffer } from "../UniformBuffer";
import Encoder from "./Encoder";

// TODO: parent.child
function pc(parent: string, child: string) {
  return parent + "." + child;
}

function setRenderSize(resolutionVector: Vector2, device: GPUDevice) {
  resolutionVector.set(
    Math.floor(
      Math.max(1, Math.min(window.innerWidth /*  * window.devicePixelRatio */, device.limits.maxTextureDimension2D))
    ),
    Math.floor(
      Math.max(1, Math.min(window.innerHeight /*  * window.devicePixelRatio */, device.limits.maxTextureDimension2D))
    )
  );
}

export class Shader extends ShaderPass {
  infoLayout: GPUBindGroupLayout;
  fragmentPipeline: GPURenderPipeline | null = null;
  computePipeline: GPUComputePipeline | null = null;
  infoBindGroup: GPUBindGroup;
  renderPassDescriptor: any;
  layout: GPUBindGroupLayout;
  parsed: ShaderMetadata;
  bindGroup!: GPUBindGroup;
  name: string;
  output: GPUTexture | undefined;
  oldShader: string;
  shaderStage: number;
  wildcards: WildCard[];
  canvas?: HTMLCanvasElement;
  context?: GPUCanvasContext;
  uResolution: Uniform<Vector2>;
  uPixelRatio: Uniform<number>;
  uAspect: Uniform<number>;
  uTime: Uniform<number>;
  uniformsMap: Map<string, Uniform<any>>;
  uniformBuffers: UniformBuffer[];

  constructor(device: GPUDevice, name: string, shader: string, wildcards: WildCard[] = []) {
    const resolutionVec2 = new Vector2();
    const uResolution = new Uniform(resolutionVec2);
    const uPixelRatio = new Uniform(0);
    const uAspect = new Uniform(0);
    const uTime = new Uniform(0);

    const uniforms = {
      uResolution,
      uAspect,
      uTime,
    };

    setRenderSize(resolutionVec2, device);

    const parsed = parseShader(shader, wildcards);

    // Base shader code that's common for both compute and fragment shaders
    const baseCode = /* wgsl */ `
    // struct Camera { 
    //   position: vec3f,
    //   quaternion: vec4f,
    //   fov: f32, 
    //   near: f32, 
    //   far: f32, 
    //   tan_half_fov: f32,
    // };

    struct InternalInfoUniforms {
      // camera: Camera,
      resolution: vec2f,
      aspect: f32,
      time: f32,
    };

    @group(1) @binding(0) var<uniform> info: InternalInfoUniforms;

    ${parsed.code}
    `;

    // Add vertex shader code only for fragment shaders
    const finalCode =
      parsed.type === "fragment"
        ? /* wgsl */ `
    ${baseCode}

    struct VertexOutput {
      @builtin(position) Position: vec4f,
    };

    @vertex
    fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
      var pos = array<vec2f, 6> (
        vec2(-1.0, -1.0),
        vec2(1.0, -1.0),
        vec2(1.0, 1.0),
        vec2(-1.0, -1.0),
        vec2(-1.0, 1.0),
        vec2(1.0, 1.0)
      );

      var output: VertexOutput;
      output.Position = vec4f(pos[VertexIndex], 0.0, 1.0);
      return output;
    }
    `
        : baseCode;
    super(device, finalCode, uniforms);

    this.oldShader = shader;
    this.name = name;
    this.parsed = parsed;
    this.wildcards = wildcards;

    this.dependOnWildCards();

    this.uResolution = uResolution;
    this.uPixelRatio = uPixelRatio;
    this.uAspect = uAspect;
    this.uTime = uTime;

    this.uniformsMap = new Map<string, Uniform<any>>();
    this.uniformBuffers = new Array<UniformBuffer>();

    this.createResources(parsed.resources);

    this.shaderStage = parsed.type === "compute" ? GPUShaderStage.COMPUTE : GPUShaderStage.FRAGMENT;

    this.infoLayout = device.createBindGroupLayout({
      label: "Shader Node Layout",
      entries: [
        {
          binding: 0,
          visibility: this.shaderStage,
          buffer: {
            type: "uniform",
          },
        },
      ],
    });

    this.layout = this.initLayout(parsed.resources);

    // Create the appropriate pipeline based on shader type
    if (parsed.type === "compute") {
      this.createComputePipeline(device);
    } else if (parsed.type === "fragment") {
      const m = parsed.metadata as FragmentShaderMetadata;
      if (m.canvas && m.canvasSize) {
        this.canvas = document.createElement("canvas");
        const [x, y] = m.canvasSize;
        this.canvas.width = x;
        this.canvas.height = y;
        this.canvas.style.position = "absolute";
        document.body.appendChild(this.canvas);

        const context = this.canvas.getContext("webgpu");
        if (!context) throw Error("ShaderNode: WebGPU Context Creation Failed!");

        this.context = context;
        this.context.configure({
          device: this.device,
          // format: "rgba16float" as GPUTextureFormat,
          format: window.navigator.gpu.getPreferredCanvasFormat(),
          alphaMode: "opaque",
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.outputs.set("canvas", this.context.getCurrentTexture());
      }
      this.createFragmentPipeline(device);
    }

    this.infoBindGroup = device.createBindGroup({
      layout: this.infoLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer.buffer,
          },
        },
      ],
    });

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: null, // Assigned later
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    } as any;

    window.addEventListener("resize", () => {
      const res = this.uResolution.value as Vector2;
      setRenderSize(res, this.device);
      this.uAspect.set(res.x / res.y);
      this.uPixelRatio.set(window.devicePixelRatio);
    });
  }

  private dependOnWildCards() {
    for (let i = 0; i < this.wildcards.length; i++) {
      const w = this.wildcards[i];
      w.addDependency(this);
    }
  }

  private createComputePipeline(device: GPUDevice) {
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.layout, this.infoLayout],
    });

    this.computePipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: device.createShaderModule({
          code: this.shader,
        }),
        entryPoint: "main",
      },
    });
  }

  private createFragmentPipeline(device: GPUDevice) {
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.layout, this.infoLayout],
    });

    this.fragmentPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({
          code: this.shader,
        }),
        entryPoint: "vert_main",
      },
      fragment: {
        module: device.createShaderModule({
          code: this.shader,
        }),
        entryPoint: "main",
        targets: [
          {
            format: this.outputTexture ? this.outputTexture.format : navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  get outputTexture() {
    if (this.parsed.type === "fragment") {
      const metadata = this.parsed.metadata as FragmentShaderMetadata;
      return this.outputs.get(metadata.view) as GPUTexture;
    }
    return undefined;
  }

  reset() {
    const oldParsed = this.parsed;
    this.parsed = parseShader(this.oldShader, this.wildcards);
    const diff = diffShaderMetadata(oldParsed, this.parsed);

    this.removeResources(diff.deletions);
    this.createResources(diff.additions);

    this.createInputs();

    // Recreate pipeline if needed
    if (diff.shaderReset) {
      const device = this.device;
      if (this.parsed.type === "compute") {
        this.createComputePipeline(device);
        this.fragmentPipeline = null;
      } else if (this.parsed.type === "fragment") {
        this.createFragmentPipeline(device);
        this.computePipeline = null;
      }
    }

    if (this.canvas) {
      const m = this.parsed.metadata as FragmentShaderMetadata;
      const [x, y] = m.canvasSize as [number, number];
      this.canvas.width = x;
      this.canvas.height = y;
    }
  }

  setInputs(inputs: Record<string, GPUSource>) {
    for (const key in inputs) {
      this.inputs.set(key, inputs[key]);
    }

    // now that the inputs are provided we can create the input bindgroup
    this.createInputs();
  }

  createInputs() {
    this.bindGroup = this.createBindGroup(this.parsed.resources);
  }

  removeResources(resources: ResourceBase[]) {
    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      const resource = this.outputs.get(r.name) as any;
      if (resource) {
        this.outputs.delete(r.name);

        if (resource.destroy) {
          resource.destroy();
        }
      }
    }
  }

  createResources(resources: ResourceBase[]) {
    for (const resource of resources) {
      switch (resource.resourceType) {
        case RESOURCE_TYPE.TEX:
          this.createTextureResource(resource as TextureObject);
          break;
        case RESOURCE_TYPE.BUF:
          this.createBufferResource(resource as BufferObject);
          break;
        case RESOURCE_TYPE.UNI:
          this.createUniformResource(resource as UniformObject);
          break;
        case RESOURCE_TYPE.SAMP:
          this.createSamplerResource(resource as SamplerObject);
          break;
        case RESOURCE_TYPE.REF:
          // References don't create new resources
          break;
      }
    }
  }

  private createTextureResource(resource: TextureObject) {
    const texture = this.device.createTexture({
      label: resource.name,
      size: {
        width: resource.size[0],
        height: resource.size[1],
        depthOrArrayLayers: resource.size[2] || 1,
      },
      format: resource.format as GPUTextureFormat,
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.outputs.set(resource.name, texture);
  }

  private createBufferResource(resource: BufferObject) {
    const elementSize = getWGSLTypeSize(resource.type);
    const size = resource.size * elementSize;
    const buffer = this.device.createBuffer({
      label: resource.name,
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this.outputs.set(resource.name, buffer);
  }

  getUniform(uniformBufferName: string, uniformName: string) {
    return this.uniformsMap.get(pc(uniformBufferName, uniformName)) as Uniform<any>;
  }

  private createUniformResource(resource: UniformObject) {
    const uniforms: Record<string, Uniform<any>> = {};
    for (const key in resource.defaults) {
      const value = resource.defaults[key];
      const uniform = new Uniform(value);
      uniforms[key] = uniform;
      this.uniformsMap.set(pc(resource.name, key), uniform);
    }

    const uniformBuffer = new UniformBuffer(this.device, uniforms);
    this.uniformBuffers.push(uniformBuffer);

    this.outputs.set(resource.name, uniformBuffer.buffer);
  }

  private createSamplerResource(resource: SamplerObject) {
    const sampler = this.device.createSampler({
      label: resource.name,
      addressModeU: resource.addressModeU,
      addressModeV: resource.addressModeV,
      addressModeW: resource.addressModeW,
      magFilter: resource.magFilter,
      minFilter: resource.minFilter,
      mipmapFilter: resource.mipmapFilter,
      lodMinClamp: resource.lodMinClamp,
      lodMaxClamp: resource.lodMaxClamp,
      compare: resource.compare,
      maxAnisotropy: resource.maxAnisotropy,
    });

    this.outputs.set(resource.name, sampler);
  }

  initLayout(resources: ResourceBase[]) {
    const entries: GPUBindGroupLayoutEntry[] = [];

    for (const resource of resources) {
      if (!resource.usedInBody) continue;

      const entry: GPUBindGroupLayoutEntry = {
        binding: resource.binding,
        visibility: this.shaderStage,
      };

      switch (resource.resourceType) {
        case RESOURCE_TYPE.TEX: {
          entry.texture = {
            viewDimension: "2d",
            sampleType: "float",
            multisampled: false,
          };
          break;
        }
        case RESOURCE_TYPE.BUF: {
          const r = resource as BufferObject;
          entry.buffer = {
            type: r.access == "read" ? "read-only-storage" : "storage",
          };
          break;
        }
        case RESOURCE_TYPE.UNI: {
          entry.buffer = {
            type: "uniform",
          };
          break;
        }
        case RESOURCE_TYPE.SAMP: {
          entry.sampler = {
            type: "filtering",
          };
          break;
        }
        case RESOURCE_TYPE.REF: {
          const refResource = resource as ReferenceObject;
          switch (refResource.category) {
            case "texture": {
              entry.texture = {
                viewDimension: "2d",
                sampleType: "float",
                multisampled: false,
              };
              break;
            }
            case "storage": {
              const r = resource as BufferObject;
              entry.buffer = {
                type: r.access == "read" ? "read-only-storage" : "storage",
              };
              break;
            }
            case "uniform": {
              entry.buffer = {
                type: "uniform",
              };
              break;
            }
            case "sampler": {
              entry.sampler = {
                type: "filtering",
              };
              break;
            }
          }
          break;
        }
      }

      entries.push(entry);
    }

    return this.device.createBindGroupLayout({
      entries,
      label: "ShaderNode layout",
    });
  }

  createBindGroup(resources: ResourceBase[]) {
    const entries: GPUBindGroupEntry[] = [];

    for (const resource of resources) {
      if (!resource.usedInBody) continue;

      const entry: GPUBindGroupEntry = {
        binding: resource.binding,
        resource: undefined!,
      };

      switch (resource.resourceType) {
        case RESOURCE_TYPE.TEX: {
          const texture = this.outputs.get(resource.name) as GPUTexture;
          if (texture) {
            entry.resource = texture.createView();
          }
          break;
        }
        case RESOURCE_TYPE.BUF:
        case RESOURCE_TYPE.UNI: {
          const buffer = this.outputs.get(resource.name) as GPUBuffer;
          if (buffer) {
            entry.resource = { buffer };
          }
          break;
        }
        case RESOURCE_TYPE.SAMP: {
          const sampler = this.outputs.get(resource.name) as GPUSampler;
          if (sampler) {
            entry.resource = sampler;
          }
          break;
        }
        case RESOURCE_TYPE.REF: {
          const refResource = resource as ReferenceObject;
          const referencedResource = this.inputs.get(refResource.name);
          if (!referencedResource) throw Error(`ShaderNode: Reference ${refResource.name} not found!`);
          const r = referencedResource.shader.outputs.get(referencedResource.name);

          if (r) {
            if (r instanceof GPUTexture) {
              entry.resource = r.createView();
            } else if (r instanceof GPUBuffer) {
              entry.resource = { buffer: r };
            } else if (r instanceof GPUSampler) {
              entry.resource = r;
            }
          }
          break;
        }
      }

      if (entry.resource) {
        entries.push(entry);
      }
    }

    return this.device.createBindGroup({
      entries,
      layout: this.layout,
      label: "ShaderNode bindgroup",
    });
  }

  private getComputeWorkgroups(): [number, number, number] {
    const metadata = this.parsed.metadata as ComputeShaderMetadata;
    if (!metadata || !metadata.threadCount) {
      throw new Error("Missing compute shader metadata");
    }

    const [x, y, z] = metadata.threadCount;
    const [a, b, c] = metadata.workgroupSize;

    return [Math.ceil(x / a), Math.ceil(y / b), Math.ceil(z / c)];
  }

  update(encoder: Encoder, debug: boolean = false) {
    const time = performance.now() / 1000;
    this.uTime.set(time);
    this.uniformBuffer.update();

    for (let i = 0; i < this.uniformBuffers.length; i++) {
      const ub = this.uniformBuffers[i];
      ub.update();
    }

    if (this.parsed.type === "compute" && this.computePipeline) {
      // Compute shader path
      const computePass = encoder.getComputePassEncoder("compute shader node pass", debug);
      computePass.setPipeline(this.computePipeline);
      computePass.setBindGroup(0, this.bindGroup);
      computePass.setBindGroup(1, this.infoBindGroup);

      const [x, y, z] = this.getComputeWorkgroups();
      computePass.dispatchWorkgroups(x, y, z);
      computePass.end();
    } else if (this.parsed.type === "fragment" && this.fragmentPipeline) {
      // Fragment shader path
      const m = this.parsed.metadata as FragmentShaderMetadata;
      const colors = this.renderPassDescriptor.colorAttachments as GPURenderPassColorAttachment[];

      if (m.canvas && this.context) {
        const canvasTexture = this.context.getCurrentTexture();
        colors[0].view = canvasTexture.createView();
      } else if (this.outputTexture) {
        colors[0].view = this.outputTexture.createView();
      } else {
        throw Error("Shader Node: No texture is available for the fragment shader to render to!");
      }

      const passEncoder = encoder.getRenderPassEncoder("quad shader node pass", this.renderPassDescriptor, debug);
      passEncoder.setPipeline(this.fragmentPipeline);
      passEncoder.setBindGroup(0, this.bindGroup);
      passEncoder.setBindGroup(1, this.infoBindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();
    }
  }
}
