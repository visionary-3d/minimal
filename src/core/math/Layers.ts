class Layers {
    mask: number;

    constructor() {
        this.mask = 1 | 0;
    }

    set(channel: number): void {
        this.mask = (1 << channel | 0) >>> 0;
    }

    enable(channel: number): void {
        this.mask |= 1 << channel | 0;
    }

    enableAll(): void {
        this.mask = 0xffffffff | 0;
    }

    toggle(channel: number): void {
        this.mask ^= 1 << channel | 0;
    }

    disable(channel: number): void {
        this.mask &= ~(1 << channel | 0);
    }

    disableAll(): void {
        this.mask = 0;
    }

    test(layers: Layers): boolean {
        return (this.mask & layers.mask) !== 0;
    }

    isEnabled(channel: number): boolean {
        return (this.mask & (1 << channel | 0)) !== 0;
    }
}

export { Layers };