import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";

import { BaseShaderFX } from "../base-fx";

export interface HeatHazeFXOptions {
  intensity: number;
  distortion: number;
  shimmer: number;
  blurStrength: number;
  speed: number;
  noiseScale: number;
  hotThreshold: number;
  hotSoftness: number;
}

export class HeatHazeFX extends BaseShaderFX<
  [target?: number, duration?: number]
> {
  private startTime = performance.now();
  private animation: { raf: number; cancel: () => void } | null = null;

  /**
   * Создаёт эффект теплового миража с настройками интенсивности и шума.
   * @param {Partial<HeatHazeFXOptions>} [options] Дополнительные параметры интенсивности.
   */
  constructor(options: Partial<HeatHazeFXOptions> = {}) {
    const {
      intensity = 0.6,
      distortion = 0.03,
      shimmer = 0.4,
      blurStrength = 0.45,
      speed = 1.0,
      noiseScale = 5.0,
      hotThreshold = 0.0,
      hotSoftness = 0.55,
    } = options;

    super(
      new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          time: { value: 0 },
          intensity: { value: intensity },
          distortion: { value: distortion },
          shimmer: { value: shimmer },
          blurStrength: { value: blurStrength },
          speed: { value: speed },
          noiseScale: { value: noiseScale },
          hotThreshold: { value: hotThreshold },
          hotSoftness: { value: hotSoftness },
        },
        vertexShader,
        fragmentShader,
      })
    );
  }

  /**
   * Запускает анимацию изменения интенсивности теплового миража.
   * @param {number} [target=1] Целевая интенсивность эффекта.
   * @param {number} [duration=750] Длительность анимации в миллисекундах.
   * @returns {Promise<void>} Промис, который выполняется по завершению анимации.
   */
  async play(target = 1, duration = 750): Promise<void> {
    const clampedTarget = Math.max(0, target);
    await this.animateIntensity(clampedTarget, duration);
  }

  /** Выполняет отрисовку эффекта. */
  render(): void {
    const elapsed = (performance.now() - this.startTime) / 1000;
    this.fxPass.uniforms.time.value = elapsed;
  }

  /**
   * Устанавливает мгновенную интенсивность эффекта теплового миража.
   * @param {number} value Значение интенсивности.
   */
  private setIntensity(value: number): void {
    this.fxPass.uniforms.intensity.value = Math.max(0, value);
  }

  /**
   * Плавно изменяет интенсивность эффекта.
   * @param {number} to Новое значение интенсивности.
   * @param {number} ms Длительность перехода в миллисекундах.
   * @returns {Promise<void>} Промис, выполняющийся после завершения анимации.
   */
  private animateIntensity(to: number, ms: number): Promise<void> {
    const from = Number(this.fxPass.uniforms.intensity.value) || 0;

    if (ms <= 0 || Math.abs(to - from) < 1e-6) {
      this.setIntensity(to);
      if (this.animation) {
        this.animation.cancel();
      }
      return Promise.resolve();
    }

    if (this.animation) {
      this.animation.cancel();
    }

    const start = performance.now();
    let raf = 0;
    let done!: () => void;

    const cancel = (): void => {
      if (raf) cancelAnimationFrame(raf);
      this.animation = null;
      done?.();
    };

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const eased = easeOutCubic(t);
      this.setIntensity(from + (to - from) * eased);

      if (t < 1) {
        raf = requestAnimationFrame(step);
        if (this.animation) this.animation.raf = raf;
      } else {
        this.animation = null;
        done();
      }
    };

    const promise = new Promise<void>((resolve) => {
      done = resolve;
    });

    this.animation = { raf: 0, cancel };
    raf = requestAnimationFrame(step);
    this.animation.raf = raf;

    return promise;
  }
}
