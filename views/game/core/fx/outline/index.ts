import { Color, Vector2, type ColorRepresentation, type Texture } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";

import { BaseShaderFX } from "../base-fx";

export interface OutlineFXOptions {
  color: ColorRepresentation;
  thickness: number;
  intensity: number;
  threshold: number;
  depthMultiplier: number;
}

export class OutlineFX extends BaseShaderFX<
  [targetIntensity?: number, duration?: number]
> {
  private animation: { raf: number; cancel: () => void } | null = null;
  private depthTexture: Texture | null = null;

  /**
   * Создаёт эффект обводки сцены на основе фильтра Собеля.
   * @param {Partial<OutlineFXOptions>} [options] Дополнительные параметры обводки.
   */
  constructor(options: Partial<OutlineFXOptions> = {}) {
    const {
      color = 0xffffff,
      thickness = 1.5,
      intensity = 1.0,
      threshold = 0.25,
      depthMultiplier = 1.25,
    } = options;

    const outlineColor = new Color(color);

    super(
      new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          resolution: { value: new Vector2(1, 1) },
          outlineColor: { value: outlineColor },
          thickness: { value: Math.max(0.5, thickness) },
          intensity: { value: Math.max(0, intensity) },
          threshold: { value: Math.max(0, threshold) },
          depthMultiplier: { value: Math.max(0, depthMultiplier) },
          tDepth: { value: null },
        },
        vertexShader,
        fragmentShader,
      })
    );
  }

  /**
   * Устанавливает текстуру глубины для расчёта контуров по геометрии.
   * @param {Texture | null} texture Текстура глубины сцены.
   */
  setDepthTexture(texture: Texture | null): void {
    this.depthTexture = texture;
    this.fxPass.uniforms.tDepth.value = this.depthTexture;
  }

  /**
   * Запускает анимацию изменения интенсивности обводки.
   * @param {number} [targetIntensity=1] Целевое значение интенсивности эффекта.
   * @param {number} [duration=0] Длительность анимации в миллисекундах.
   * @returns {Promise<void>} Промис, выполняющийся по завершении анимации.
   */
  async play(targetIntensity = 1, duration = 0): Promise<void> {
    const safeTarget = Math.max(0, targetIntensity);
    await this.animateIntensity(safeTarget, duration);
  }

  /**
   * Устанавливает размеры буфера пост-обработки и обновляет шейдерные униформы.
   * @param {number} width Ширина области вывода.
   * @param {number} height Высота области вывода.
   */
  setSize(width: number, height: number): void {
    super.setSize(width, height);
    const resolution = this.fxPass.uniforms.resolution
      .value as Vector2;
    resolution.set(Math.max(1, width), Math.max(1, height));

  }

  /**
   * Устанавливает мгновенную интенсивность обводки.
   * @param {number} value Значение интенсивности.
   */
  private setIntensity(value: number): void {
    this.fxPass.uniforms.intensity.value = Math.max(0, value);
  }

  /**
   * Плавно изменяет интенсивность эффекта обводки.
   * @param {number} to Новое значение интенсивности.
   * @param {number} ms Длительность перехода в миллисекундах.
   * @returns {Promise<void>} Промис, выполняющийся по завершении анимации.
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

    const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const eased = easeOutQuad(t);
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
