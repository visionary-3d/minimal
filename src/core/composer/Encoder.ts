import Stats from "../libs/Stats";
import { TimingHelperPool } from "../libs/timing-helper";

export default class Encoder {
  device: GPUDevice;
  encoder: GPUCommandEncoder;
  commandBufferArray: GPUCommandBuffer[];
  debug: boolean;
  timerEncoderIndex: number = 0;
  map: Map<string, TimingHelperPool>;
  constructor(device: GPUDevice, debug: boolean = false) {
    this.device = device;
    this.commandBufferArray = new Array<GPUCommandBuffer>(1);

    this.debug = debug;

    this.encoder = device.createCommandEncoder();
    this.map = new Map();
  }

  getTimedEncoder(label: string) {
    const timedEncoder = this.map.get(label);
    if (timedEncoder) {
      return timedEncoder.getTimingHelper();
    } else {
      const pool = new TimingHelperPool(this.device, 10);
      this.map.set(label, pool);
      return pool.getTimingHelper();
    }
  }

  createCommandEncoder() {
    this.encoder = this.device.createCommandEncoder();

    return this.encoder;
  }

  getCommandEncoder() {
    return this.encoder;
  }

  submit(stats?: Stats) {
    this.commandBufferArray[0] = this.encoder.finish();
    this.device.queue.submit(this.commandBufferArray);

    if (this.debug) {
      let duration = 0;

      this.map.forEach((pool: TimingHelperPool) => {
        pool.end();
        duration += pool.duration;
      });

      if (stats) {
        stats.gpuTime = duration;
      }
    }

    this.timerEncoderIndex = 0;
    this.createCommandEncoder();
  }

  getComputePassEncoder(label: string, debug: boolean = false) {
    const commandEncoder = this.getCommandEncoder();

    let passEncoder: GPUComputePassEncoder;
    if (this.debug && debug) {
      const timer = this.getTimedEncoder(label);
      passEncoder = timer.beginComputePass(commandEncoder);
    } else {
      this.map.delete(label);
      passEncoder = commandEncoder.beginComputePass();
    }

    return passEncoder;
  }

  getRenderPassEncoder(label: string, desc: GPURenderPassDescriptor, debug: boolean = false) {
    const commandEncoder = this.getCommandEncoder();

    let passEncoder: GPURenderPassEncoder;
    if (this.debug && debug) {
      const timer = this.getTimedEncoder(label);
      passEncoder = timer.beginRenderPass(commandEncoder, desc);
    } else {
      passEncoder = commandEncoder.beginRenderPass(desc);
    }

    return passEncoder;
  }
}
