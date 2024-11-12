import { Shader } from "../passes/Shader";

export type GPUResourceType = GPUBuffer | GPUTexture | GPUSampler | GPUExternalTexture;
export type GPUSource = { shader: Shader; name: string };
