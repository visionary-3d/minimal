// styles
import "./styles/style.css";

// minimal
import { Color, Composer, GUI, Shader, Uniform, Vector2, WildCard } from "minimal-gpu";

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

  @buffer(@size(wc.resolution.x * wc.resolution.y * 3)) var<storage, read> color_buffer: array<f32>;

  `;

  const cShader = /* wgsl */ `

  @ref(resource.color_buffer) var<storage, read_write> color_buffer: array<f32>;

  struct Uniforms {
    color: vec3<f32>,
  };

  // ! Struct Types are important because the initializer needs a name to work with
  // ! so "uniforms: vec3<f32>;" is not allowed...
  @uniform(@color(0.05, 0.7, 0.4)) var<uniform> uniforms: Uniforms;

  fn in_bounds(pos: vec2<u32>, bounds: vec2<f32>) -> bool {
    return f32(pos.x) < bounds.x && 
           f32(pos.y) < bounds.y;
  }

  fn write_colors(i: u32, color: vec3f) {
    let index = i * 3;
    color_buffer[index + 0] = color.x;
    color_buffer[index + 1] = color.y;
    color_buffer[index + 2] = color.z;
  }

  @compute @num_threads(wc.resolution.x, wc.resolution.y)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {

    if(!in_bounds(global_id.xy, window.resolution)) {
      return;
    }

    let index = global_id.x + global_id.y * u32(window.resolution.x);
    write_colors(index, uniforms.color);

  }

  `;

  const VERTEX_COUNT = 6;

  const gShader = /* wgsl */ `

  @buffer(@size(3 * ${VERTEX_COUNT})) var<storage, read_write> position: array<vec3<f32>>;

  @compute @num_threads(${VERTEX_COUNT})
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {

    // check bounds
    if(global_id.x >= ${VERTEX_COUNT}) {
      return;
    }

    var pos = array<vec3f, ${VERTEX_COUNT}> (
      vec3(-1.0, -1.0, 0.0),
      vec3(1.0, -1.0, 0.0),
      vec3(1.0, 1.0, 0.0),
      vec3(-1.0, -1.0, 0.0),
      vec3(-1.0, 1.0, 0.0),
      vec3(1.0, 1.0, 0.0)
    );

    position[global_id.x] = pos[global_id.x];

  }

  `;

  const fShader = /* wgsl */ `

  @ref(geometry.position) var<storage, read> position: array<vec3f>;
  @ref(resource.color_buffer) var<storage, read> color_buffer: array<f32>;

  struct VertexOutput {
    @builtin(position) position: vec4f,
  };

  // quad
  @vertex @count(${VERTEX_COUNT}) 
  fn vert_main(@builtin(vertex_index) i: u32) -> VertexOutput {

    var output: VertexOutput;
    output.position = vec4f(position[i], 1.0);

    return output;

  }

  fn read_color(i: u32) -> vec3f {
    let index = i * 3;
    return vec3(color_buffer[index], color_buffer[index + 1], color_buffer[index + 2]);
  }

  @fragment @view(@canvas(wc.resolution))
  fn frag_main(@builtin(position) coord: vec4f) -> @location(0) vec4<f32> {

    let index = u32(coord.x + coord.y * window.resolution.x);
    let color = read_color(index);

    return vec4(color, 1);

  }

  `;

  // wildcards
  const resolution = new WildCard("resolution", [window.innerWidth, window.innerHeight]);

  // uniforms
  const resolutionVec2 = new Vector2();
  const uResolution = new Uniform(resolutionVec2);
  const uAspect = new Uniform(0);
  const uTime = new Uniform(0);

  const uniforms = {
    uResolution,
    uAspect,
    uTime,
  };

  const resize = () => {
    resolution.set(window.innerWidth, window.innerHeight); // update wildcard

    const res = uResolution.value as Vector2;
    res.set(
      Math.floor(Math.max(1, Math.min(window.innerWidth, device.limits.maxTextureDimension2D))),
      Math.floor(Math.max(1, Math.min(window.innerHeight, device.limits.maxTextureDimension2D)))
    );
    uAspect.set(res.x / res.y);
    uResolution.set(res);
  };

  resize();

  // create shaders

  const resourceNode = new Shader(device, "resource", rShader, [resolution], uniforms);
  const colorizeNode = new Shader(device, "colorize", cShader, [resolution], uniforms);
  const geometryNode = new Shader(device, "geometry", gShader);
  const visualNode = new Shader(device, "fullscreen", fShader, [resolution], uniforms);

  document.body.appendChild(visualNode.getCanvas());

  const composer = new Composer(device, true);

  // add all the shaders
  composer.addShader(resourceNode);
  composer.addShader(colorizeNode);
  composer.addShader(geometryNode);
  composer.addShader(visualNode);

  // set all the inputs. prepare for running.
  composer.setInputs();

  // run all shaders in sequence
  composer.update();

  // get rid of shaders that need to run only one time
  composer.removeShader(geometryNode);

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
