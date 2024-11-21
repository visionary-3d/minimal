// styles
import "./styles/style.css";

// minimal
import { Color, Composer, GUI, Shader, WildCard } from "minimal-gpu";

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

  const rShader = /* wgsl */ `

  @buffer(@size(wc.resolution.x * wc.resolution.y * 3)) var<storage, read> output_buffer: array<f32>;

  `;

  const cShader = /* wgsl */ `

  @ref(resource.output_buffer) var<storage, read_write> input_buffer: array<f32>;

  struct Uniforms {
    color: vec3<f32>,
  };

  // ! Struct Types are important because the initializer needs a name to work with
  // ! so "uniforms: vec3<f32>;" is not allowed...
  @uniform(@color(0.05, 0.7, 0.4)) var<uniform> uniforms: Uniforms;

  @compute(wc.resolution.x, wc.resolution.y)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = (global_id.x + global_id.y * u32(window.resolution.x)) * 3;
    input_buffer[index + 0] = uniforms.color.x;
    input_buffer[index + 1] = uniforms.color.y;
    input_buffer[index + 2] = uniforms.color.z;
  }

  `;

  const fShader = /* wgsl */ `

  @ref(resource.output_buffer) var<storage, read> input_buffer: array<f32>;

  @fragment(@canvas(wc.resolution))
  fn main(@builtin(position) coord: vec4f) -> @location(0) vec4<f32> {
    let index = u32(coord.x + coord.y * window.resolution.x) * 3;
    let color = vec3(input_buffer[index], input_buffer[index + 1], input_buffer[index + 2]);

    return vec4(color, 1);
  }

  `;

  // create shaders

  const resolution = new WildCard("resolution", [window.innerWidth, window.innerHeight]);

  window.addEventListener("resize", () => {
    resolution.set(window.innerWidth, window.innerHeight); // update wildcard
  });

  const resourceNode = new Shader(device, "resource", rShader, [resolution]);
  const colorizeNode = new Shader(device, "colorize", cShader, [resolution]);
  const fullscreenNode = new Shader(device, "fullscreen", fShader, [resolution]);

  document.body.appendChild(fullscreenNode.getCanvas());

  const composer = new Composer(device, true);

  // add all the shaders
  composer.addShader(resourceNode);
  composer.addShader(colorizeNode);
  composer.addShader(fullscreenNode);

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


async function init() {
  await startApp();
}

init();

