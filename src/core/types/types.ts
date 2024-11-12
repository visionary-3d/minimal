export type GPUResourceType = GPUBuffer | GPUTexture | GPUSampler | GPUExternalTexture;
export type GPUSource = { node: { outputs: Map<string, GPUResourceType> }; name: string };
