import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";

import { BaseShaderFX } from "../base-fx";

export interface BlackoutFXOptions {
  strength: number;
  scale: number;
  threshold: number;
  edge: number;
}

export class BlackoutFX extends BaseShaderFX<
  [mode: "hide" | "show", duration?: number]
> {
  private animation: { raf: number; cancel: () => void } | null = null;

  /**
   * Создаёт эффект затемнения сцены с указанными параметрами.
   * @param {BlackoutFXOptions} [options] Настройки интенсивности и плавности.
   */
  constructor(options: Partial<BlackoutFXOptions> = {}) {
    const {
      strength = 1.0,
      scale = 4.0,
      threshold = 0.0,
      edge = 0.0,
    } = options;

    super(
      new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          strength: { value: strength },
          scale: { value: scale },
          threshold: { value: threshold },
          edge: { value: edge },
        },
        vertexShader,
        fragmentShader,
      })
    );
  }

  /**
   * Запускает анимацию появления или исчезновения затемнения.
   * @param {"hide" | "show"} mode Режим скрытия либо показа сцены.
   * @param {number} [duration=2000] Длительность анимации в миллисекундах.
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

  /**
   * Устанавливает порог срабатывания эффекта.
   * @param {number} value Значение порога в диапазоне [0, 1].
   */
  private setThreshold(value: number): void {
    this.fxPass.uniforms.threshold.value = Math.min(1, Math.max(0, value));
  }

  /**
   * Плавно изменяет порог эффекта.
   * @param {number} to Конечное значение порога.
   * @param {number} [ms=200] Длительность анимации в миллисекундах.
   * @returns {Promise<void>} Промис, который выполняется после завершения анимации.
   */
  private animateThreshold(to: number, ms = 200): Promise<void> {
    to = Math.min(1, Math.max(0, to));

    const u = this.fxPass.uniforms;
    const from = Number(u.threshold.value) || 0;

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
    const easeInOutQuad = (t: number) =>
      t < 0.5 ? 2.0 * t * t : 1.0 - Math.pow(1.0 - (2.0 * t - 1.0), 2.0) / 2.0;

    let raf = 0;
    let done!: () => void;

    const cancel = () => {
      if (raf) cancelAnimationFrame(raf);
      this.animation = null;
      done?.();
    };

    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const k = easeInOutQuad(t);
      this.setThreshold(from + (to - from) * k);

      if (t < 1) {
        raf = requestAnimationFrame(step);
        if (this.animation) this.animation.raf = raf;
      } else {
        this.animation = null;
        done();
      }
    };

    const p = new Promise<void>((resolve) => {
      done = resolve;
    });

    this.animation = { raf: 0, cancel };
    raf = requestAnimationFrame(step);
    this.animation.raf = raf;

    return p;
  }
}
