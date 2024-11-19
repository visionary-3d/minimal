# Minimal :: A Shader Driven WebGPU Framework 💎 ( ⚠ WIP ) 

Introduction Video:

[![2 (2)](https://github.com/user-attachments/assets/36ca15d5-8fe5-4f5b-aed7-c0b9ec44e82e)](https://youtu.be/Sx39Y--kZvY)

### **⚠ Disclamer: Minimal is WIP and still under heavy development!**

Minimal is a thin layer of abstraction on top of WebGPU with the purpose of making Shader Programming easier!

At the core of minimal, is an idea called Shader Driven Programming, which allows you to create and control your GPU resources dynamically from shader code.

Minimal introduces **MSL** (Minimal Shading Language) which is a **superset of WGSL** (the shading language of WebGPU).

Learn more about minimal, and how to use it by watching this video:

### 🔗 **https://youtu.be/Sx39Y--kZvY**

## Installation

```bash
npm i minimal-gpu
```

## Usage

### Decorators

Decorators (also known as Attributes in WGSL), are words that start with the **@** symbol.

#### NOTE: **required parameters are marked with a `*`**

@texture() => creates a GPU texture ( `GPUTexture` )
- @size(*) => defines the texture size
- @format(*) => defines the texture format

example:
```wgsl
@texture(@size(1920, 1080), @format(rgba16float)) var output_texture: texture_2d<f32>;
```

@buffer() => creates a storage buffer ( `GPUBuffer` )
- @size(*) => defines the buffer size
- @stride() => defines the buffer stride

example:
```wgsl
@buffer(@size(1920 * 1080)) var<storage, read> output_buffer: array<f32>;
```

@uniform() => creates a uniform buffer ( `GPUBuffer` )
- @uniform_name(*) => initializes a property in the uniform struct

**NOTE: the struct type is required.**

example:
```wgsl
struct Uniforms {
  color: vec3<f32>,
};

@uniform(@color(0.05, 0.7, 0.4)) var<uniform> uniforms: Uniforms;
```

@ref => references a GPU resource by binding it to the shader
- input format should be (shader_name.resource_name)

example:
```wgsl
@ref(resource.output_buffer) var<storage, read_write> input_buffer: array<f32>;
```

@sampler() => creates a GPU sampler resource ( `GPUSampler` ).
- @addressModeU()
- @addressModeV()
- @addressModeW()
- @magFilter()
- @minFilter()
- @mipmapFilter()
- @lodMinClamp()
- @lodMaxClamp()
- @compare()
- @maxAnisotropy

example:
```
@sampler(@addressModeU(repeat), @addressModeV(repeat)) var tex_sampler_1: sampler;
@sampler var tex_sampler_2: sampler;
```

@group => default wgsl decorator which we'll handle implicitly and explicitly
@binding => default wgsl decorator which we'll handle implicitly and explicitly

@compute(*) => required decorator for compute shaders => it takes in the number of threads as input.

example:
```wgsl
// 1D
@compute(100)

// 2D
@compute(100, 100)

// 3D
@compute(100, 100, 100)
```

@fragment(*) => required decorator for fragment shaders => it takes in a texture name as input

example:
```wgsl
@fragment(output_texture)
```

@canvas => creates a canvas element, and can only be used as the input to a @fragment decorator. takes in the width and the height as inputs.

example:
```wgsl
@fragment(@canvas(1920, 1080))
```


### WildCards

Wildcards are special variables that can be used as inputs in MSL decorators. Wildcards can be (f32, vec2<f32>, vec3<f32>, vec4<f32>).

Example of Resource Shader, using a wildcard:
```ts
const rShader = /* wgsl */ `
  @buffer(@size(wc.resolution.x * wc.resolution.y)) var<storage, read> output_buffer: array<f32>;
`;

const resolution = new WildCard("resolution", [window.innerWidth, window.innerHeight]);

window.addEventListener("resize", () => {
  resolution.set(window.innerWidth, window.innerHeight); // update wildcard
});

const resourceNode = new Shader(device, "resource", rShader, [resolution]);

```

### Shaders

Shaders are the core building block in Minimal.

Example of Compute Shader:
```ts
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
const redNode = new Shader(device, "fullscreen", fShader, [resolution]);

document.body.appendChild(redNode.getCanvas());

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
```

## Roadmap

- vertex shader support
- capable 3d renderer
- camera control system
- geometry generation compute shaders
- more decorators for dynamic resource creation like @length, @count etc...

