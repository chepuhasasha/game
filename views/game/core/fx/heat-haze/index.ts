import { NoBlending } from "three";
import type { Camera, Scene, WebGLRenderer } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";

import type { FX } from "../../types";

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

export class HeatHazeFX implements FX<[target?: number, duration?: number]> {
  composer: EffectComposer | null = null;
  fxPass: ShaderPass | null = null;

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

    this.fxPass = new ShaderPass({
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
    });

    this.fxPass.material.toneMapped = false;
    this.fxPass.material.depthTest = false;
    this.fxPass.material.blending = NoBlending;
  }

  /**
   * Регистрирует шейдерный проход в композере пост-обработки.
   * @param {WebGLRenderer} renderer Активный рендерер сцены.
   * @param {Scene} scene Сцена, над которой выполняется эффект.
   * @param {Camera} camera Камера сцены.
   * @param {EffectComposer} composer Общий композер пост-обработки.
   * @returns {Pass} Регистрируемый проход пост-обработки.
   */
  setup(
    _renderer: WebGLRenderer,
    _scene: Scene,
    _camera: Camera,
    composer: EffectComposer
  ): Pass {
    this.composer = composer;
    if (!this.fxPass) {
      throw new Error("Проход эффекта теплового миража не инициализирован.");
    }

    this.disable();

    return this.fxPass;
  }

  /** Включает пост-эффект. */
  enable(): void {
    if (this.fxPass) {
      this.fxPass.enabled = true;
    }
  }

  /** Отключает пост-эффект. */
  disable(): void {
    if (this.fxPass) {
      this.fxPass.enabled = false;
    }
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
    if (!this.fxPass) {
      return;
    }

    const elapsed = (performance.now() - this.startTime) / 1000;
    this.fxPass.uniforms.time.value = elapsed;
  }

  /**
   * Устанавливает размеры буфера пост-обработки.
   * @param {number} width Ширина области вывода.
   * @param {number} height Высота области вывода.
   */
  setSize(width: number, height: number): void {
    this.composer?.setSize(width, height);
  }

  /**
   * Устанавливает мгновенную интенсивность эффекта теплового миража.
   * @param {number} value Значение интенсивности.
   */
  private setIntensity(value: number): void {
    if (!this.fxPass) {
      return;
    }
    this.fxPass.uniforms.intensity.value = Math.max(0, value);
  }

  /**
   * Плавно изменяет интенсивность эффекта.
   * @param {number} to Новое значение интенсивности.
   * @param {number} ms Длительность перехода в миллисекундах.
   * @returns {Promise<void>} Промис, выполняющийся после завершения анимации.
   */
  private animateIntensity(to: number, ms: number): Promise<void> {
    if (!this.fxPass) {
      return Promise.resolve();
    }

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
