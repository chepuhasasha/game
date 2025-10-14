import type { Viewport } from "./viewport";

export interface GameObject {
  /** Вызывается каждый кадр.
   * @param {number} dt Дельта времени в секундах. */
  update(dt: number): void;
  dispose(): void;
}

export interface FX {
  enable: () => void;
  disable: () => void;
  play: (options: any) => Promise<void>;
  render: () => void
  setSize: (width: number, height: number) => void
}

export interface Extension {
  setup: (viewport: Viewport) => void;
}

export enum EventName {
  INIT = "INIT",
  LOOP = "LOOP",
  ROTATION_STEP = "ROTATION_STEP",
}
