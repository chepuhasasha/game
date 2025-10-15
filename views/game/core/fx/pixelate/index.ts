import { Vector2 } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";

import { BaseShaderFX } from "../base-fx";

export interface PixelateFXOptions {
  pixelSize: number;
  colorLevels: number;
  ditherStrength: number;
  gamma: number;
}

export class PixelateFX extends BaseShaderFX<[
  options?: Partial<PixelateFXOptions>
]> {
  /**
   * Создаёт пост-эффект пикселизации с настройками уровня детализации.
   * @param {Partial<PixelateFXOptions>} [options] Параметры пикселизации и палитры.
   */
  constructor(options: Partial<PixelateFXOptions> = {}) {
    const {
      pixelSize = 8,
      colorLevels = 5,
      ditherStrength = 0.45,
      gamma = 0.85,
    } = options;

    super(
      new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          resolution: { value: new Vector2(1, 1) },
          pixelSize: { value: pixelSize },
          colorLevels: { value: colorLevels },
          ditherStrength: { value: ditherStrength },
          gamma: { value: gamma },
        },
        vertexShader,
        fragmentShader,
      })
    );
  }

  /**
   * Обновляет параметры эффекта и применяет новые значения без анимации.
   * @param {Partial<PixelateFXOptions>} [options] Новые значения параметров фильтра.
   * @returns {Promise<void>} Промис, который выполняется сразу после обновления.
   */
  async play(options: Partial<PixelateFXOptions> = {}): Promise<void> {
    if (options.pixelSize !== undefined) {
      this.setPixelSize(options.pixelSize);
    }

    if (options.colorLevels !== undefined) {
      this.setColorLevels(options.colorLevels);
    }

    if (options.ditherStrength !== undefined) {
      this.setDitherStrength(options.ditherStrength);
    }

    if (options.gamma !== undefined) {
      this.setGamma(options.gamma);
    }

    return Promise.resolve();
  }

  /**
   * Передаёт актуальные размеры буфера рендеринга в шейдер пост-эффекта.
   * @param {number} width Текущая ширина области вывода.
   * @param {number} height Текущая высота области вывода.
   */
  setSize(width: number, height: number): void {
    super.setSize(width, height);
    const resolution = this.fxPass.uniforms.resolution.value as Vector2;
    resolution.set(Math.max(1, width), Math.max(1, height));
  }

  /**
   * Устанавливает размер пиксельного блока эффекта.
   * @param {number} value Желаемый размер блока в пикселях.
   */
  private setPixelSize(value: number): void {
    this.fxPass.uniforms.pixelSize.value = Math.max(1, value);
  }

  /**
   * Задаёт количество уровней квантования цвета.
   * @param {number} value Число уровней яркости для каналов RGB.
   */
  private setColorLevels(value: number): void {
    this.fxPass.uniforms.colorLevels.value = Math.max(1, value);
  }

  /**
   * Управляет силой добавляемого дизеринга.
   * @param {number} value Интенсивность шумовой составляющей в диапазоне [0, 1].
   */
  private setDitherStrength(value: number): void {
    this.fxPass.uniforms.ditherStrength.value = Math.max(0, value);
  }

  /**
   * Настраивает гамма-коррекцию квантованного изображения.
   * @param {number} value Значение гаммы, которое следует применить.
   */
  private setGamma(value: number): void {
    this.fxPass.uniforms.gamma.value = Math.max(0.01, value);
  }
}
