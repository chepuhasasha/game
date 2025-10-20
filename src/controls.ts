import { Box3, Spherical, Vector2, Vector3 } from "three";
import type { Object3D } from "three";

import type { Viewport } from "./viewport";

export type ControlsOptions = {
  /** Скорость реакции камеры на перемещение указателя. */
  rotateSpeed?: number;
  /** Минимально допустимое значение полярного угла. */
  minPolarAngle?: number;
  /** Максимально допустимое значение полярного угла. */
  maxPolarAngle?: number;
};

export type RotationDelta = {
  /** Горизонтальная компонента перемещения указателя. */
  x: number;
  /** Вертикальная компонента перемещения указателя. */
  y: number;
};

/** Управляет вращением камеры вокруг выбранного объекта. */
export class Controls {
  private readonly target = new Vector3();
  private readonly box = new Box3();
  private readonly cameraSpherical = new Spherical();
  private readonly lightSpherical = new Spherical();
  private readonly tempOffset = new Vector3();
  private readonly tempLightOffset = new Vector3();
  private readonly pointerDelta = new Vector2();

  private readonly rotateSpeed: number;
  private readonly minPolarAngle: number;
  private readonly maxPolarAngle: number;

  /**
   * Создаёт контроллер вращения камеры вокруг заданной цели.
   * @param {Viewport} viewport Управляемый вьюпорт.
   * @param {ControlsOptions} [options] Дополнительные настройки контроллера.
   */
  constructor(private readonly viewport: Viewport, options: ControlsOptions = {}) {
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.minPolarAngle = options.minPolarAngle ?? 0.01;
    this.maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.01;

    this.target.copy(this.viewport.focus);
    this.syncSpherical();
  }

  /**
   * Устанавливает объект, вокруг которого должна вращаться камера.
   * @param {Object3D | null} object Трёхмерный объект или `null` для сброса выбора.
   */
  setTargetObject(object: Object3D | null): void {
    if (!object) {
      this.target.copy(this.viewport.focus);
      this.syncSpherical();
      return;
    }

    this.box.setFromObject(object);

    if (this.box.isEmpty()) {
      object.getWorldPosition(this.target);
    } else {
      this.box.getCenter(this.target);
    }

    this.viewport.setFocus(this.target);
    this.syncSpherical();
  }

  /**
   * Поворачивает камеру вокруг текущей цели на заданный угол.
   * @param {RotationDelta} delta Величины смещения указателя по осям X и Y.
   */
  rotate(delta: RotationDelta): void {
    this.pointerDelta.set(delta.x, delta.y).multiplyScalar(this.rotateSpeed);

    this.cameraSpherical.theta -= this.pointerDelta.x;
    this.cameraSpherical.phi -= this.pointerDelta.y;

    this.cameraSpherical.phi = this.clamp(
      this.cameraSpherical.phi,
      this.minPolarAngle,
      this.maxPolarAngle
    );

    this.lightSpherical.theta -= this.pointerDelta.x;
    this.lightSpherical.phi = this.clamp(
      this.lightSpherical.phi - this.pointerDelta.y,
      this.minPolarAngle,
      this.maxPolarAngle
    );

    this.applyCameraPosition();
    this.applyLightPosition();

    this.viewport.setFocus(this.target);
  }

  /** Синхронизирует сферические координаты камеры и света с текущим состоянием сцены. */
  private syncSpherical(): void {
    const { camera, light } = this.viewport;

    this.cameraSpherical.setFromVector3(
      this.tempOffset.copy(camera.position).sub(this.target)
    );
    this.lightSpherical.setFromVector3(
      this.tempLightOffset.copy(light.position).sub(this.target)
    );
  }

  /** Применяет обновлённую позицию камеры на основании сферических координат. */
  private applyCameraPosition(): void {
    const { camera } = this.viewport;

    this.tempOffset.setFromSpherical(this.cameraSpherical);
    camera.position.copy(this.target).add(this.tempOffset);
    camera.lookAt(this.target);
    camera.updateMatrixWorld(true);
  }

  /** Применяет обновлённую позицию источника света на основании сферических координат. */
  private applyLightPosition(): void {
    const { light } = this.viewport;

    this.tempLightOffset.setFromSpherical(this.lightSpherical);
    light.position.copy(this.target).add(this.tempLightOffset);
    light.target.position.copy(this.target);
    light.target.updateMatrixWorld();
  }

  /**
   * Ограничивает значение указанными пределами.
   * @param {number} value Исходное значение.
   * @param {number} min Нижняя граница диапазона.
   * @param {number} max Верхняя граница диапазона.
   * @returns {number} Обрезанное значение.
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
