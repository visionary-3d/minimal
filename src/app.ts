import { Composer } from "./core/Pass";
import { ShaderNode } from "./core/passes/ShaderNode";

// @ts-ignore
import { GUI } from "./core/libs/lil-gui.module.min.js";
import { Color } from "./core/math/Color.js";
import { Uniform } from "./core/UniformBuffer.js";

export const startApp = async () => {
  const navigator = window.navigator as any;
  if (!navigator.gpu) throw new Error("WebGPU not supported, this application will not run.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter found");

  const device = (await adapter.requestDevice({
    requiredFeatures: ["timestamp-query"],
  })) as GPUDevice;

  const computeShader = /* wgsl */ `

  @buffer(@size(info.resolution.x * info.resolution.y * 3)) var<storage, read_write> output_buffer: array<f32>;

  struct Uniforms {
    color: vec3<f32>,
  };

  // ! Struct Types are important because of initializer
  @uniform(@color(0.05, 0.7, 0.4)) var<uniform> uniforms: Uniforms;

  `;

  const colorizeShader = /* wgsl */ `

  @ref(colorize.output_buffer) var<storage, read_write> input_buffer: array<f32>;

  struct Uniforms {
    color: vec3<f32>,
  };
  @ref(colorize.uniforms) var<uniform> uniforms: Uniforms;

  @compute(info.resolution)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = (global_id.x + global_id.y * u32(info.resolution.x)) * 3;
    input_buffer[index + 0] = uniforms.color.x;
    input_buffer[index + 1] = uniforms.color.y;
    input_buffer[index + 2] = uniforms.color.z;
  }

  `;

  const fragmentShader = /* wgsl */ `

  @ref(colorize.output_buffer) var<storage, read> input_buffer: array<f32>;

  fn get_uvs(coord: vec4<f32>) -> vec2<f32> {
    var uv = coord.xy / info.resolution;

    uv.y = 1.0 - uv.y;

    return uv;
  }

  @fragment(@canvas)
  fn main(@builtin(position) coord: vec4f) -> @location(0) vec4<f32> {
    let uv = get_uvs(coord);

    let index = u32(coord.x + coord.y * info.resolution.x) * 3;
    let color = vec3(input_buffer[index], input_buffer[index + 1], input_buffer[index + 2]);

    return vec4(color, 1);
  }

  `;

  const resourceNode = new ShaderNode(device, "resource", computeShader);
  const colorizeNode = new ShaderNode(device, "colorize", colorizeShader);
  const redNode = new ShaderNode(device, "uv_pass", fragmentShader);

  // set inputs
  colorizeNode.setInputs({
    input_buffer: { node: resourceNode, name: "output_buffer" },
    uniforms: {
      node: resourceNode,
      name: "uniforms",
    },
  });
  redNode.setInputs({ input_buffer: { node: resourceNode, name: "output_buffer" } });

  // create inputs
  resourceNode.createInputs();
  colorizeNode.createInputs();
  redNode.createInputs();

  // gui

  const gui = new GUI();

  // pass in the uniform buffer name + the individual uniform name
  const colorUniform = resourceNode.getUniform("uniforms", "color");

  // load in default values of the uniform
  const colorStruct = new Color().fromArray(colorUniform.array as number[]);
  const controlParams = {
    colorStruct,
  };
  gui.addColor(controlParams, "colorStruct").onChange((newColor: Color) => {
    // update the uniform
    colorUniform.set(newColor);
  });

  const composer = new Composer(device, true);

  composer.addPass(resourceNode);
  composer.addPass(colorizeNode);
  composer.addPass(redNode);

  function tick() {
    composer.update();

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
};
