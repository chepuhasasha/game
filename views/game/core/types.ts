import type { Camera, Scene, WebGLRenderer } from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

export interface GameObject {
  /**
   * Вызывается каждый кадр.
   * @param {number} dt Дельта времени в секундах.
   */
  update(dt: number): void;
  /** Очищает ресурсы объекта. */
  dispose(): void;
}

export interface FX<TPlayArgs extends unknown[] = unknown[]> {
  /** Включает эффект. */
  enable(): void;
  /** Отключает эффект. */
  disable(): void;
  /**
   * Создаёт и добавляет проход пост-обработки в общий композер.
   * @param {WebGLRenderer} renderer Текущий рендерер WebGL.
   * @param {Scene} scene Сцена, к которой применяется эффект.
   * @param {Camera} camera Камера сцены.
   * @param {EffectComposer} composer Композер пост-обработки вьюпорта.
   * @returns {Pass} Созданный проход пост-обработки.
   */
  setup(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    composer: EffectComposer
  ): Pass;
  /**
   * Запускает анимацию или поведение эффекта.
   * @param {TPlayArgs} args Параметры запуска эффекта.
   */
  play(...args: TPlayArgs): Promise<void>;
  /** Выполняет отрисовку эффекта. */
  render(): void;
  /**
   * Устанавливает размеры вывода эффекта.
   * @param {number} width Ширина области вывода.
   * @param {number} height Высота области вывода.
   */
  setSize(width: number, height: number): void;
}

export interface Extension<V = unknown> {
  /**
   * Настраивает или регистрирует расширение на переданном вьюпорте.
   * @param {V} viewport Экземпляр вьюпорта, с которым работает расширение.
   */
  setup(viewport: V): void;
}
