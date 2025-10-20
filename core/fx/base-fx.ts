import { NoBlending } from "three";
import type { Camera, Scene, WebGLRenderer } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

import type { FX } from "../types";

export abstract class BaseShaderFX<TPlayArgs extends unknown[]>
  implements FX<TPlayArgs>
{
  protected composer: EffectComposer | null = null;

  protected constructor(protected readonly fxPass: ShaderPass) {
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
   * @returns {Pass} Шейдерный проход пост-обработки.
   */
  setup(
    _renderer: WebGLRenderer,
    _scene: Scene,
    _camera: Camera,
    composer: EffectComposer
  ): Pass {
    this.composer = composer;
    this.disable();

    return this.fxPass;
  }

  /** Включает пост-эффект. */
  enable(): void {
    this.fxPass.enabled = true;
  }

  /** Отключает пост-эффект. */
  disable(): void {
    this.fxPass.enabled = false;
  }

  /** Выполняет отрисовку эффекта. */
  render(): void {}

  /**
   * Устанавливает размеры буфера пост-обработки.
   * @param {number} width Ширина области вывода.
   * @param {number} height Высота области вывода.
   */
  setSize(width: number, height: number): void {
    this.composer?.setSize(width, height);
  }

  /**
   * Запускает анимацию или поведение эффекта.
   * @param {TPlayArgs} args Параметры запуска эффекта.
   */
  abstract play(...args: TPlayArgs): Promise<void>;
}
