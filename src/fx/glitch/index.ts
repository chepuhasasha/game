import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";

import { BaseShaderFX } from "../base-fx";

export interface GlitchFXOptions {
  intensity: number;
  blockSize: number;
  chromaticAberration: number;
  lineStrength: number;
  noiseScale: number;
  tearStrength: number;
  flickerStrength: number;
}

export class GlitchFX extends BaseShaderFX<
  [mode: "hide" | "show", duration?: number]
> {
  private animation: { raf: number; cancel: () => void } | null = null;
  private readonly startTime = performance.now();

  /**
   * Создаёт глитч-эффект с параметрами искажений и цветового сдвига.
   * @param {Partial<GlitchFXOptions>} [options] Дополнительные настройки интенсивности.
   */
  constructor(options: Partial<GlitchFXOptions> = {}) {
    const {
      intensity = 0.75,
      blockSize = 8.0,
      chromaticAberration = 0.01,
      lineStrength = 0.85,
      noiseScale = 2.2,
      tearStrength = 1.0,
      flickerStrength = 0.4,
    } = options;

    super(
      new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          time: { value: 0 },
          threshold: { value: 0 },
          intensity: { value: intensity },
          blockSize: { value: blockSize },
          chromaticAberration: { value: chromaticAberration },
          lineStrength: { value: lineStrength },
          noiseScale: { value: noiseScale },
          tearStrength: { value: tearStrength },
          flickerStrength: { value: flickerStrength },
        },
        vertexShader,
        fragmentShader,
      })
    );
  }

  /**
   * Запускает анимацию появления либо затухания глитч-эффекта.
   * @param {"hide" | "show"} mode Режим скрытия или показа искажений.
   * @param {number} [duration=2000] Длительность перехода в миллисекундах.
   */
  async play(mode: "hide" | "show", duration = 2000): Promise<void> {
    if (mode === "hide") {
      this.setThreshold(1.0);
      await this.animateThreshold(0.0, duration);
    } else if (mode === "show") {
      this.setThreshold(0.0);
      await this.animateThreshold(1.0, duration);
    }
  }

  /** Выполняет отрисовку эффекта и обновляет время шумов. */
  render(): void {
    const elapsed = (performance.now() - this.startTime) / 1000;
    this.fxPass.uniforms.time.value = elapsed;
  }

  /**
   * Устанавливает текущее значение порога интенсивности эффекта.
   * @param {number} value Значение порога в диапазоне [0, 1].
   */
  private setThreshold(value: number): void {
    this.fxPass.uniforms.threshold.value = Math.min(1, Math.max(0, value));
  }

  /**
   * Плавно изменяет порог глитч-эффекта со временем.
   * @param {number} to Конечное значение порога.
   * @param {number} [ms=200] Длительность анимации в миллисекундах.
   * @returns {Promise<void>} Промис, который выполняется после завершения перехода.
   */
  private animateThreshold(to: number, ms = 200): Promise<void> {
    to = Math.min(1, Math.max(0, to));

    const uniforms = this.fxPass.uniforms;
    const from = Number(uniforms.threshold.value) || 0;

    if (ms <= 0 || Math.abs(to - from) < 1e-6) {
      this.setThreshold(to);
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

    const easeInOutCubic = (t: number): number =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const eased = easeInOutCubic(t);
      this.setThreshold(from + (to - from) * eased);

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
