import { Shader } from "../shaders/Shader";

export type GPUResourceType = GPUBuffer | GPUTexture | GPUSampler | GPUExternalTexture;
export type GPUSource = { shader: Shader; name: string };
