// styles
import { OrbitControls } from "./controllers/OrbitControls";
import "./styles/style.css";

import {
  Color,
  Composer,
  GUI,
  Shader,
  WildCard,
  Camera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  Uniform,
  Vector2,
} from "minimal-gpu";

export const hypercubeShader = /* wgsl */ `
fn get_uvs(coord: vec4f) -> vec2<f32> {
  return coord.xy / window.resolution;
}

fn hash(p: vec3f) -> f32 {
  let id = floor(p + 0.5);
  return (1.0 + cos(sin(dot(id, vec3(113.1, 17.81, -33.58))) * 43758.545)) / 2.0;
}

fn warp(p: vec3f, n: i32) -> f32 {
  var v = 0.0;
  for (var i = 0; i < n; i = i + 1) {
    v = hash(p + vec3(v, v, v));
  }
  return v;
}

struct ColorPoint {
  color: vec3f,
  position: f32
};

fn colorize(id: f32, uv: vec2<f32>, range: vec2<f32>) -> vec3f {

  const NUM_COLORS = 7;
  var colors: array<ColorPoint, NUM_COLORS> = array<ColorPoint, NUM_COLORS>(
    ColorPoint(vec3(1.0, 1.0, 1.0), 0.0),
    ColorPoint(vec3(3.0, 0.0, 0.0), 0.0),
    ColorPoint(vec3(3.0, 2.0, 2.0), 0.0),
    ColorPoint(vec3(30.0, 1.0, 1.0), 0.0),
    ColorPoint(vec3(3.0, 1.0, 1.0), 0.0),
    ColorPoint(vec3(14.0, 1.0, 1.0), 0.0),
    ColorPoint(vec3(0.0, 0.0, 0.0), 0.0)
  );

  let inc = (range.y - range.x) / f32(NUM_COLORS - 2);

  // start
  colors[0].position = 0.0;
  
  // end
  colors[NUM_COLORS - 1].position = range.y;

  // rest
  for (var i = 1; i < NUM_COLORS - 1; i++) {
    colors[i].position = range.x + f32(i - 1) * inc;
  }

  let s = clamp(smoothstep(range.x, range.y, uv.x), 0.0, 1.0);
  let selector = s + id * s;

  var color = vec3(0.0);

  for (var i = 0; i < NUM_COLORS; i++) {
    let currentColor = colors[i];
    let is_in_between = currentColor.position <= selector;
    color = select(color, currentColor.color, is_in_between);
  }

  return color;
}

fn ease_out_expo(t: f32) -> f32 {
  return 1.0 - pow(2.0, -10.0 * t);
}

// 4D Cube

//------------------------------------------------------------------
// intersecting a quadrilateral with a window in it
//------------------------------------------------------------------

struct Intersect {
  distance: f32, // distance from camera
  normal: vec3f, // normal of the intersection point
  internal_distance_squared: f32, // distance from quad edge
  face: u32, // face index
};

fn select_intersect(a: Intersect, b: Intersect, c: bool) -> Intersect {
  return Intersect(select(a.distance, b.distance, c), select(a.normal, b.normal, c), select(a.internal_distance_squared, b.internal_distance_squared, c), select(a.face, b.face, c));
}

const NON_INTERSECT = Intersect(-1.0, vec3f(0.0), 0.0, 0);

fn quad_intersect(ro: vec3f, rd: vec3f, v0: vec3f, v1: vec3f, v2: vec3f, v3: vec3f, tmin: f32, tmax: f32, face: u32) -> Intersect {
  // make v0 the origin
  let r1 = v1 - v0;
  let r2 = v2 - v0;
  let r3 = v3 - v0;
  let rz = ro - v0;

  // intersect with the quad's plane
  let nor = cross(r1, r2);
  let t = -dot(rz, nor) / dot(rd, nor);
  
  // early exit
  if (t < tmin || t > tmax) {
    return NON_INTERSECT;
  }
  
  // intersection point
  let rp = rz + t * rd;
  
  // build reference frame for the quad (uu, vv, ww)
  let ww = normalize(nor);
  let l1 = length(r1);
  let uu = r1 / l1;
  let vv = cross(uu, ww);
  
  // project all vertices to 2D into the (uu, vv) plane
  let k0 = vec2(0.0, 0.0);
  let k1 = vec2(l1, 0.0);
  let k2 = vec2(dot(r2, uu), dot(r2, vv));
  let k3 = vec2(dot(r3, uu), dot(r3, vv));
  let kp = vec2(dot(rp, uu), dot(rp, vv));

  // compute 2D distance from intersection point to quad edges
  let e0 = k1 - k0;
  let p0 = kp - k0;
  let e1 = k2 - k1;
  let p1 = kp - k1;
  let e2 = k3 - k2;
  let p2 = kp - k2;
  let e3 = k0 - k3;
  let p3 = kp - k3;
  
  let c0 = e0.x * p0.y - e0.y * p0.x;
  let c1 = e1.x * p1.y - e1.y * p1.x;
  let c2 = e2.x * p2.y - e2.y * p2.x;
  let c3 = e3.x * p3.y - e3.y * p3.x;
  
  // if outside, early out
  if (max(max(c0, c1), max(c2, c3)) > 0.0) {
    return NON_INTERSECT;
  }
  
  // euclidean internal distance squared
  let d: f32 = min(min(c0 * c0 / dot(e0, e0), c1 * c1 / dot(e1, e1)), min(c2 * c2 / dot(e2, e2), c3 * c3 / dot(e3, e3)));
  
  let normal = normalize(nor); 
  let normal_facing_camera = normal * select(-1.0, 1.0, dot(normal, rd) < 0.0);
  
  // create a window inside the hypercube
  const WINDOW_SIZE: f32 = 0.3;
  let internal_squared_window = pow(WINDOW_SIZE, 2.0);

  // return ray distance, normal, and distance from intersection to quad edges
  return select_intersect(Intersect(t, normal_facing_camera, d, face), NON_INTERSECT, d > internal_squared_window);
}

// taken from: https://www.shadertoy.com/view/4XXBWr
// originally created by inigo quilez

const FACES_LENGTH: u32 = 24;
const FACES : array<i32, FACES_LENGTH> = array<i32, FACES_LENGTH>(
  306,30277,47753,52734,340,30243,47855,52632,408,30447,47651,52564,
  612,29971,47583,52904,680,30175,47379,52836,1224,29631,40273,59942
);


fn decode_face(f: i32) -> vec4<i32> {
  return vec4<i32>((f >> 12) & 15, (f >> 8) & 15, (f >> 4) & 15, f & 15);
}

fn intersect_closest(ro: vec3f, rd: vec3f, vertices: array<vec3f, 16>) -> Intersect {
  const MAX_DIST: f32 = 1e10;

  var res = Intersect(MAX_DIST, vec3f(0.0), -1.0, 0);

  for (var i: u32 = 0; i < FACES_LENGTH; i = i + 1) {
    let idx = decode_face(FACES[i]); // decode face indices
    let tmp = quad_intersect(ro, rd, vertices[idx.x], vertices[idx.y], vertices[idx.z], vertices[idx.w], 0.0, res.distance, i);
    res = select_intersect(res, tmp, tmp.distance > 0.0);
  }

  return select_intersect(NON_INTERSECT, res, res.distance < MAX_DIST);
}

fn apply_color_mask(background: vec3f, input: vec3f, colored_mask: vec3f) -> vec3f {

  var color = background;

  const MAGICAL_WEIGHTS: vec3f = vec3(0.2126, 0.7152, 0.0722);

  // de-saturate the colored_mask
  let mask_luminance = dot(colored_mask, MAGICAL_WEIGHTS);

  // take the inverse of that
  let clear_mask = clamp(1.0 - mask_luminance, 0.0, 1.0);

  // make the background black using this mask
  color *= clear_mask; 

  // apply the input using the colored mask
  color += input * colored_mask;

  return color;

}

//* Taken From Three.js
fn apply_quaternion(v: vec3<f32>, q: vec4f) -> vec3<f32> {

  //calculate quat * vector
  var qv: vec4f = vec4f (
    q.w * v.x + q.y * v.z - q.z * v.y,
    q.w * v.y + q.z * v.x - q.x * v.z,
    q.w * v.z + q.x * v.y - q.y * v.x,
    -q.x * v.x - q.y * v.y - q.z * v.z
  );

  //calculate result * inverse quat
  return vec3<f32> (
    qv.x * q.w + qv.w * -q.x + qv.y * -q.z - qv.z * -q.y,
    qv.y * q.w + qv.w * -q.y + qv.z * -q.x - qv.x * -q.z,
    qv.z * q.w + qv.w * -q.z + qv.x * -q.y - qv.y * -q.x
  );
}

fn get_camera_to_pixel(coords: vec2<f32>) -> vec3<f32> {

  var camera = window.camera;

  let d = 1.0 / camera.tan_half_fov;
  let camera_to_pixel = normalize(vec3(coords, -d));

  //* vector direction correction based on camera rotation
  let camera_to_pixel_rotated: vec3<f32> = apply_quaternion(camera_to_pixel, camera.quaternion);

  //* direction of the vector
  let pixel_view_direction: vec3<f32> = normalize(camera_to_pixel_rotated);

  return pixel_view_direction;

}

fn get_material_color(col: vec3<f32>, pos: vec3<f32>, nor: vec3<f32>, vertices: array<vec3f, 16>, face: u32, coord: vec4f) -> vec3<f32> {

  // material
  let idx = decode_face(FACES[face]); // decode face indices

  var l = length(vertices[idx.x] - vertices[idx.y]);
  l = max(l, length(vertices[idx.y] - vertices[idx.z]));
  l = max(l, length(vertices[idx.z] - vertices[idx.w]));
  l = max(l, length(vertices[idx.w] - vertices[idx.x]));
  l = l + nor.x * 1.5;

  var mat_color = vec3f(l/8.0);
  mat_color = max(mat_color, vec3(0.0, 0.0, 0.0));

  let uv = get_uvs(coord);

  let coord_scaled = pos * 8.0;
  let time = window.time;
  let id = warp(coord_scaled + vec3(time, time, 10.0), 5);
  const LENGTH = 0.4;
  const TIME_DIVIDER: f32 = 10.0;
  let animation = fract(time / TIME_DIVIDER) - 0.01;
  let start = saturate(ease_out_expo(animation));

  // const END_TIME: f32 = 5.0; // 5 seconds
  // let range = select(vec2(start, start + LENGTH), vec2(100.0), (END_TIME / TIME_DIVIDER) < animation);

  let range = vec2(start, start + LENGTH);
  let exist_mask = colorize(id, uv, range);

  return apply_color_mask(col, mat_color, exist_mask);

}

fn render(ro: vec3f, rd: vec3f, vertices: array<vec3f, 16>, px: vec2<f32>, coord: vec4f) -> vec3f {
  // background
  // var col = vec3(0.001, 0.001, 0.003);
  var col = vec3(0.5);

  // vignette
  // col = col * (1.0 - 0.4 * length(px));

  // 4D cube
  let intersect = intersect_closest(ro, rd, vertices);
  let face = intersect.face;
  // let internal_distance_squared = intersect.internal_distance_squared;
  let distance = intersect.distance;
  var mat_color = vec3(0);

  if (distance > 0.0) {
    let pos = ro + distance * rd;
    let nor = intersect.normal;

    col = get_material_color(col, pos, nor, vertices, face, coord);

  }

  // gamma correction
  // return pow(col, vec3<f32>(1.0 / 2.2));
  return col;
}

fn set_camera(ro: vec3f, ta: vec3f, cr: f32) -> mat3x3<f32> {
  let cw = normalize(ta - ro);
  let cp = vec3(sin(cr), cos(cr), 0.0);
  let cu = normalize(cross(cw, cp));
  let cv = cross(cu, cw);
  return mat3x3<f32>(cu, cv, cw);
}

fn rot(a: f32) -> mat2x2<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat2x2<f32>(c, -s, s, c);
}

fn transform(p: vec4f, time: f32) -> vec3f {
  let p_xy = rot(6.283185 * time / 18.0) * p.xy;
  let p_zw = rot(6.283185 * time / 6.0) * p.zw;

  let p4d = vec4(p_xy, p_zw);

  // 4D to 3D projection
  return 4.0 * p4d.xyz / (4.1 + p4d.w);
}

struct VertexOutput {
    @builtin(position) position: vec4f,
};

// quad
@vertex @count(6) 
fn vert_main(@builtin(vertex_index) i: u32) -> VertexOutput {

    var pos = array<vec2f, 6> (
      vec2(-1.0, -1.0),
      vec2(1.0, -1.0),
      vec2(1.0, 1.0),
      vec2(-1.0, -1.0),
      vec2(-1.0, 1.0),
      vec2(1.0, 1.0)
    );

    var output: VertexOutput;
    output.position = vec4f(pos[i], 0.0, 1.0);

    return output;

}



@fragment @view(@canvas(wc.resolution))
fn frag_main(@builtin(position) coord: vec4f) -> @location(0) vec4<f32> {


  let time = window.time;

  let pixel_coord = (2.0 * coord.xy - window.resolution) / window.resolution.y;

  // Define the origin of the ray
  let ro = window.camera.position.xyz;

  // Define the direction of the ray
  let rd = get_camera_to_pixel(pixel_coord);

  const p = 1.0; // positive
  const n = -1.0; // negative

  // Rotate 4D cube
  let vertices = array<vec3f, 16>(
    transform(vec4(n, n, n, n), time),
    transform(vec4(n, n, n, p), time),
    transform(vec4(n, n, p, n), time),
    transform(vec4(n, n, p, p), time),
    transform(vec4(n, p, n, n), time),
    transform(vec4(n, p, n, p), time),
    transform(vec4(n, p, p, n), time),
    transform(vec4(n, p, p, p), time),
    transform(vec4(p, n, n, n), time),
    transform(vec4(p, n, n, p), time),
    transform(vec4(p, n, p, n), time),
    transform(vec4(p, n, p, p), time),
    transform(vec4(p, p, n, n), time),
    transform(vec4(p, p, n, p), time),
    transform(vec4(p, p, p, n), time),
    transform(vec4(p, p, p, p), time)
  );

  // Render (assumed render function to be defined elsewhere)
  let col = render(ro, rd, vertices, pixel_coord, coord);

  return vec4f(col, 1.0);

}

`;

class CameraStruct {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
  near: number;
  far: number;
  tanHalfFov: number;
  constructor(camera: Camera) {
    this.position = camera.position;
    this.quaternion = camera.quaternion;
    const pc = camera as PerspectiveCamera;
    this.fov = pc.fov ?? 0;
    this.near = pc.near ?? 0;
    this.far = pc.far ?? 0;
    this.tanHalfFov = Math.tan((Math.PI / 360) * this.fov);
  }
}

export const startApp = async () => {
  // create webgpu device

  const navigator = window.navigator as any;
  if (!navigator.gpu) throw new Error("WebGPU not supported, this application will not run.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter found");

  const device = (await adapter.requestDevice({
    requiredFeatures: ["timestamp-query"],
  })) as GPUDevice;

  // wildcards

  const camera = new PerspectiveCamera(50, 0, 0.1, 1000);
  const cameraStruct = new CameraStruct(camera);
  const uCamera = new Uniform(cameraStruct);

  camera.aspect = window.innerWidth / window.innerHeight;

  camera.position.z = 6;
  camera.position.x = -6;
  camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);

  const resolutionVec2 = new Vector2();
  const uResolution = new Uniform(resolutionVec2);
  const uAspect = new Uniform(0);
  const uTime = new Uniform(0);

  const uniforms = {
    uCamera,
    uResolution,
    uAspect,
    uTime,
  };

  const resolution = new WildCard("resolution", [window.innerWidth, window.innerHeight]);

  const resize = () => {
    resolution.set(window.innerWidth, window.innerHeight); // update wildcard

    const res = uResolution.value as Vector2;
    res.set(
      Math.floor(Math.max(1, Math.min(window.innerWidth, device.limits.maxTextureDimension2D))),
      Math.floor(Math.max(1, Math.min(window.innerHeight, device.limits.maxTextureDimension2D)))
    );
    camera.aspect = res.x / res.y;
    uAspect.set(res.x / res.y);
    uResolution.set(res);
  };

  resize();

  window.addEventListener("resize", resize);

  const visualNode = new Shader(device, "fullscreen", hypercubeShader, [resolution], uniforms);

  const canvas = visualNode.getCanvas();
  document.body.appendChild(canvas);

  const composer = new Composer(device, true);

  // add all the shaders
  composer.addShader(visualNode);

  // set all the inputs. prepare for running.
  composer.setInputs();

  const controls = new OrbitControls(camera);
  controls.connect(canvas);

  let lastTime = 0;

  function tick() {
    const time = performance.now() / 1000;
    uTime.set(time);

    composer.update();

    const timeDiff = time - lastTime;
    controls.update(time, timeDiff);

    lastTime = time;

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
};

async function init() {
  await startApp();
}

init();
