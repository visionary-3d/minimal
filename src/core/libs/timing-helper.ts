const assert = (cond: boolean, msg = "") => {
  if (!cond) {
    throw new Error(msg);
  }
};

enum QUERY_SET_STATE {
  FREE,
  BUSY,
}
class QuerySet {
  querySet?: GPUQuerySet;
  resolveBuffer?: GPUBuffer;
  resultBuffer?: GPUBuffer;
  state: QUERY_SET_STATE = QUERY_SET_STATE.FREE;
  constructor(querySet?: GPUQuerySet, resolveBuffer?: GPUBuffer, resultBuffer?: GPUBuffer) {
    this.querySet = querySet;
    this.resolveBuffer = resolveBuffer;
    this.resultBuffer = resultBuffer;
  }
}

export enum TIMING_STATE {
  FREE,
  NEED_RESOLVE,
  WAIT_FOR_RESULT,
}

export default class TimingHelper {
  device: GPUDevice;
  querySets: Array<QuerySet>;
  currentSet: QuerySet;
  state: TIMING_STATE;
  end: Function;

  constructor(device: GPUDevice) {
    const canTimestamp = device.features.has("timestamp-query");
    assert(canTimestamp, "Timestamp query is not supported");

    this.device = device;

    const NUM_QUERY_SETS = 10;
    this.querySets = new Array(NUM_QUERY_SETS);
    for (let i = 0; i < NUM_QUERY_SETS; i++) {
      this.querySets[i] = this.initQuerySet();
    }

    this.currentSet = new QuerySet();
    this.state = TIMING_STATE.FREE;
    this.end = () => {};
  }

  initQuerySet() {
    const device = this.device;

    const querySet = device.createQuerySet({
      type: "timestamp",
      count: 2,
    });

    const resolveBuffer = device.createBuffer({
      size: 2 * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });

    const resultBuffer = device.createBuffer({
      size: 2 * 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    return new QuerySet(querySet, resolveBuffer, resultBuffer);
  }

  getQuerySet() {
    for (let i = 0; i < this.querySets.length; i++) {
      const q = this.querySets[i];
      if (q.state === QUERY_SET_STATE.FREE) {
        q.state = QUERY_SET_STATE.BUSY;
        return q;
      }
    }

    console.warn("No free query sets, creating new one");
    return this.initQuerySet();
  }

  beginRenderTimestampPass(encoder: GPUCommandEncoder, desc: GPURenderPassDescriptor) {
    assert(this.state === TIMING_STATE.FREE, "state not free");
    this.state = TIMING_STATE.NEED_RESOLVE;

    this.currentSet = this.getQuerySet();

    const pass = encoder.beginRenderPass({
      ...desc,
      timestampWrites: {
        querySet: this.currentSet.querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    } as GPURenderPassDescriptor);

    const resolve = () => this.resolveTiming(encoder);
    pass.end = (function (origFn: Function) {
      return function () {
        origFn.call(pass);
        resolve();
      };
    })(pass.end);

    return pass;
  }

  beginComputeTimestampPass(encoder: GPUCommandEncoder, desc?: GPUComputePassDescriptor) {
    assert(this.state === TIMING_STATE.FREE, "state not free");
    this.state = TIMING_STATE.NEED_RESOLVE;

    this.currentSet = this.getQuerySet();

    const pass = encoder.beginComputePass({
      ...desc,
      timestampWrites: {
        querySet: this.currentSet.querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    } as GPUComputePassDescriptor);

    const resolve = () => this.resolveTiming(encoder);
    pass.end = (function (origFn: Function) {
      return function () {
        origFn.call(pass);
        resolve();
      };
    })(pass.end);

    return pass;
  }

  beginRenderPass(encoder: GPUCommandEncoder, desc: GPURenderPassDescriptor) {
    return this.beginRenderTimestampPass(encoder, desc);
  }

  beginComputePass(encoder: GPUCommandEncoder, desc?: GPUComputePassDescriptor) {
    return this.beginComputeTimestampPass(encoder, desc);
  }

  resolveTiming(encoder: GPUCommandEncoder) {
    assert(!!this.currentSet, "must call beginRenderPass or beginComputePass");
    assert(this.state === TIMING_STATE.NEED_RESOLVE, "must call addTimestampToPass");
    this.state = TIMING_STATE.WAIT_FOR_RESULT;

    const querySet = this.currentSet.querySet;
    const resolveBuffer = this.currentSet.resolveBuffer;
    const resultBuffer = this.currentSet.resultBuffer;

    if (querySet && resolveBuffer && resultBuffer) {
      encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
      encoder.copyBufferToBuffer(resolveBuffer, 0, resultBuffer, 0, resultBuffer?.size);
    }
  }

  async getResult() {
    assert(!!this.currentSet);
    assert(this.state === TIMING_STATE.WAIT_FOR_RESULT, "must call resolveTiming");
    this.state = TIMING_STATE.FREE;

    const q = this.currentSet;
    const resultBuffer = q.resultBuffer;

    if (resultBuffer) {
      await resultBuffer.mapAsync(GPUMapMode.READ);
      const times = new BigInt64Array(resultBuffer.getMappedRange());
      // console.log(times.length)
      const duration = Number(times[1] - times[0]);
      resultBuffer.unmap();
      q.state = QUERY_SET_STATE.FREE;
      return duration;
    }

    console.warn("Timing Helper: no result buffer");
    return 0;
  }
}

// using the same code as in the startApp function
export class TimingHelperPool {
  device: GPUDevice;
  timingHelpers: Array<TimingHelper>;
  duration: number = 0;
  timingHelper: TimingHelper;
  constructor(device: GPUDevice, count: number) {
    this.device = device;
    this.timingHelpers = new Array(count);
    for (let i = 0; i < count; i++) {
      this.timingHelpers[i] = new TimingHelper(device);
    }
    this.timingHelper = this.timingHelpers[0];
  }

  getTimingHelper() {
    for (let i = 0; i < this.timingHelpers.length; i++) {
      const timingHelper = this.timingHelpers[i];
      if (timingHelper.state === TIMING_STATE.FREE) {
        this.timingHelper = timingHelper;
        return timingHelper;
      }
    }

    console.warn("No free timing helpers, creating new one");
    this.timingHelper = new TimingHelper(this.device);
    return this.timingHelper;
  }

  end() {
    this.timingHelper.getResult().then((durationInNanoSeconds: number) => {
      if (durationInNanoSeconds) {
        const durationInMilliseconds = durationInNanoSeconds / 1000 / 1000;
        this.update(durationInMilliseconds);
        // this.timingHelper.currentSet.state = QUERY_SET_STATE.FREE;
      }
    });
  }

  update(duration: number) {
    this.duration = duration;
  }
}
