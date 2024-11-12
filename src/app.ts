import { Composer } from "./core/Pass";
import { Shader } from "./core/passes/Shader.js";

// @ts-ignore
import { GUI } from "./core/libs/lil-gui.module.min.js";
import { Color } from "./core/math/Color.js";
import { Vector2 } from "./core/math/Vector2.js";
import { WildCard } from "./core/shaders/Parsing.js";

export const startApp = async () => {
  // create webgpu device

  const navigator = window.navigator as any;
  if (!navigator.gpu) throw new Error("WebGPU not supported, this application will not run.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter found");

  const device = (await adapter.requestDevice({
    requiredFeatures: ["timestamp-query"],
  })) as GPUDevice;

  // write shaders

  const computeShader = /* wgsl */ `

  @buffer(@size(info.resolution.x * info.resolution.y * 3)) var<storage, read_write> output_buffer: array<f32>;

  `;

  const colorizeShader = /* wgsl */ `

  @ref(resource.output_buffer) var<storage, read_write> input_buffer: array<f32>;

  struct Uniforms {
    color: vec3<f32>,
  };

  // ! Struct Types are important because the initializer needs a name to work with
  // ! so "uniforms: vec3<f32>;" is not allowed...
  @uniform(@color(0.05, 0.7, 0.4)) var<uniform> uniforms: Uniforms;

  @compute(info.resolution)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = (global_id.x + global_id.y * u32(info.resolution.x)) * 3;
    input_buffer[index + 0] = uniforms.color.x;
    input_buffer[index + 1] = uniforms.color.y;
    input_buffer[index + 2] = uniforms.color.z;
  }

  `;

  const fragmentShader = /* wgsl */ `

  @ref(resource.output_buffer) var<storage, read> input_buffer: array<f32>;

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

  // create shaders

  const resolution = new Vector2(window.innerWidth, window.innerHeight);
  const resolutionWildcard = new WildCard("resolution", resolution);

  window.addEventListener("resize", () => {
    resolutionWildcard.set(resolution.set(window.innerWidth, window.innerHeight));
  });

  const resourceNode = new Shader(device, "resource", computeShader, [resolutionWildcard]);
  const colorizeNode = new Shader(device, "colorize", colorizeShader, [resolutionWildcard]);
  const redNode = new Shader(device, "uv_pass", fragmentShader, [resolutionWildcard]);

  const composer = new Composer(device, true);

  // add all the shaders
  composer.addShader(resourceNode);
  composer.addShader(colorizeNode);
  composer.addShader(redNode);

  // set all the inputs. prepare for running.
  composer.setInputs();

  function tick() {
    composer.update();

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // gui

  const gui = new GUI();

  // pass in the uniform buffer name + the individual uniform name
  const colorUniform = colorizeNode.getUniform("uniforms", "color");

  // load in default values of the uniform
  const colorStruct = new Color().fromArray(colorUniform.array as number[]);
  const controlParams = {
    colorStruct,
  };
  gui.addColor(controlParams, "colorStruct").onChange((newColor: Color) => {
    // update the uniform
    colorUniform.set(newColor);
  });
};
