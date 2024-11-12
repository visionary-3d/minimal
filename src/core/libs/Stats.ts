interface StatsPanel {
  dom: HTMLCanvasElement;
  update(value: number, maxValue: number): void;
}

let statsCount = 0;

class Stats {
  public averageMilliseconds: number = 0;
  public dom: HTMLDivElement;
  public name: string;
  private mode: number;
  private container: HTMLDivElement;
  private panels: StatsPanel[];
  private beginTime: number;
  private prevTime: number;
  private frames: number;
  private latencyArray: Float32Array;
  private gpuTimeArray: Float32Array;
  maxDataPoints: number;
  currentIndex: number;
  gpuTime: number = 0;

  constructor(name: string = "Stats") {
    this.name = name;
    this.dom = document.createElement("div");

    const numStats = statsCount;
    statsCount++;

    this.dom.style.cssText = `position:fixed;top:${numStats * 70}px;left:0;cursor:pointer;opacity:0.9;z-index:90000`;
    this.mode = 0;
    this.container = document.createElement("div");
    this.container.addEventListener("click", this.onContainerClick.bind(this));
    this.dom.appendChild(this.container);
    this.panels = [];
    this.beginTime = performance.now();
    this.prevTime = this.beginTime;
    this.frames = 0;
    this.currentIndex = 0;

    // Number of data points for the past 10 seconds
    const seconds = 10;
    this.maxDataPoints = Math.ceil(seconds * 60);
    this.latencyArray = new Float32Array(this.maxDataPoints);
    this.gpuTimeArray = new Float32Array(this.maxDataPoints);

    this.addPanel(new StatsPanel(this.name + " :: ", "FPS", "#f41f3b", "#010313", 0, this.maxDataPoints));
    this.addPanel(new StatsPanel(this.name + " :: ", "MS", "#00e663", "#011305", 4, this.maxDataPoints));
    this.addPanel(new StatsPanel(this.name + " :: ", "MS", "#24ffff", "#010513", 4, this.maxDataPoints));
    if (self.performance && (self.performance as any).memory) {
      this.addPanel(new StatsPanel(this.name + " :: ", "MB", "#fcff38", "#121202", 0, this.maxDataPoints));
    }
    this.showPanel(0);

    document.body.appendChild(this.dom);
  }

  public addPanel(panel: StatsPanel) {
    this.container.appendChild(panel.dom);
    this.panels.push(panel);
    return panel;
  }

  public showPanel(id: number) {
    this.mode = id;
    this.panels.forEach((panel, index) => {
      panel.dom.style.display = index === id ? "block" : "none";
    });

    return this;
  }

  public begin() {
    this.beginTime = performance.now();

    return this;
  }

  public end() {
    this.frames++;
    const time = performance.now();
    const latency = time - this.beginTime;

    this.latencyArray[this.currentIndex] = latency;
    this.gpuTimeArray[this.currentIndex] = this.gpuTime;
    this.currentIndex = (this.currentIndex + 1) % this.latencyArray.length;

    this.panels[1].update(latency, 10, this.latencyArray, this.currentIndex);
    this.panels[2].update(this.gpuTime, 10, this.gpuTimeArray, this.currentIndex);

    if (time >= this.prevTime + 1000) {
      this.panels[0].update((this.frames * 1000) / (time - this.prevTime), 200);
      this.prevTime = time;
      this.frames = 0;
      if (this.panels[3]) {
        const memory = (performance as any).memory;
        this.panels[3].update(memory.usedJSHeapSize / 1048576, memory.jsHeapSizeLimit / 1048576);
      }
    }

    return time;
  }

  public update() {
    this.beginTime = this.end();

    return this;
  }

  public setMode(id: number) {
    this.showPanel(id);

    return this;
  }

  private onContainerClick(event: MouseEvent) {
    event.preventDefault();
    this.showPanel(++this.mode % this.container.children.length);

    return this;
  }
}

class StatsPanel {
  public dom: HTMLCanvasElement;
  private context: CanvasRenderingContext2D | null;
  private min: number;
  private max: number;
  private WIDTH: number;
  private HEIGHT: number;
  private TEXT_X: number;
  private TEXT_Y: number;
  private GRAPH_X: number;
  private GRAPH_Y: number;
  private GRAPH_WIDTH: number;
  private GRAPH_HEIGHT: number;
  private name: string;
  private fg: string;
  private bg: string;
  private precision: number;
  private maxDataPoints: number;
  private statName: string;

  constructor(
    statName: string,
    name: string,
    fg: string,
    bg: string,
    precision: number = 0,
    maxDataPoints: number = 600
  ) {
    this.statName = statName;
    this.name = name;
    this.precision = precision;
    this.bg = bg;
    this.fg = fg;
    this.maxDataPoints = maxDataPoints;
    this.dom = document.createElement("canvas");
    this.dom.style.cssText = "width:150px;height:70px";
    this.context = this.dom.getContext("2d");
    this.min = Infinity;
    this.max = 0;
    this.WIDTH = 300;
    this.HEIGHT = 150;
    this.TEXT_X = 10;
    this.TEXT_Y = 10;
    this.GRAPH_X = 10;
    this.GRAPH_Y = 45;
    this.GRAPH_WIDTH = 278;
    this.GRAPH_HEIGHT = 90;
    if (this.context) {
      this.context.font = `900 ${23}px Noto Sans Mono, Arial, sans-serif`;
      this.context.textBaseline = "top";
      this.context.fillStyle = bg;
      this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);
      this.context.fillStyle = fg;
      this.context.fillText(this.name, this.TEXT_X, this.TEXT_Y);
      this.context.fillRect(this.GRAPH_X, this.GRAPH_Y, this.GRAPH_WIDTH, this.GRAPH_HEIGHT);
      this.context.fillStyle = bg;
      this.context.globalAlpha = 0.9;
      this.context.fillRect(this.GRAPH_X, this.GRAPH_Y, this.GRAPH_WIDTH, this.GRAPH_HEIGHT);
    }
  }

  public update(v: number, maxValue: number, data?: Float32Array, currentIndex?: number): void {
    let value = v;

    if (data && currentIndex) {
      value = this.calculateAverage(data, currentIndex);
    }

    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    if (this.context) {
      this.context.fillStyle = this.bg;
      this.context.globalAlpha = 1;
      this.context.fillRect(0, 0, this.WIDTH, this.GRAPH_Y);
      this.context.fillStyle = this.fg;
      this.context.fillText(this.statName + value.toFixed(this.precision) + " " + this.name, this.TEXT_X, this.TEXT_Y);

      this.context.drawImage(
        this.dom,
        this.GRAPH_X + 1,
        this.GRAPH_Y,
        this.GRAPH_WIDTH - 1,
        this.GRAPH_HEIGHT,
        this.GRAPH_X,
        this.GRAPH_Y,
        this.GRAPH_WIDTH - 1,
        this.GRAPH_HEIGHT
      );

      this.context.fillRect(this.GRAPH_X + this.GRAPH_WIDTH - 1, this.GRAPH_Y, 1, this.GRAPH_HEIGHT);

      this.context.fillStyle = this.bg;
      this.context.globalAlpha = 0.9;
      this.context.fillRect(
        this.GRAPH_X + this.GRAPH_WIDTH - 1,
        this.GRAPH_Y,
        1,
        Math.round((1 - value / maxValue) * this.GRAPH_HEIGHT)
      );
    }
  }

  calculateAverage(data: Float32Array, currentIndex: number): number {
    let sum = 0;
    let count = 0;

    let dataIndex = currentIndex;
    for (let i = 0; i < this.maxDataPoints; i++) {
      sum += data[dataIndex];
      count++;

      dataIndex = (dataIndex + 1) % data.length;
    }

    return sum / count;
  }
}

export default Stats;
