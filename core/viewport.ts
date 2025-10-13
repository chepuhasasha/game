import type { ExpoWebGLRenderingContext } from "expo-gl";
import {
  Scene,
  WebGLRenderer,
  Color,
  OrthographicCamera,
  AmbientLight,
  DirectionalLight,
  Object3D,
  Vector3,
  Box3,
  Matrix4,
} from "three";
import type { Updatable } from "./updatable";
import { Renderer } from "expo-three";
import { configureRendererPhysicMaterials } from "./materials";

export class Viewport {
  private scene!: Scene;
  private renderer!: WebGLRenderer;
  private camera!: OrthographicCamera;
  private raf = 0;
  private last = 0;
  private viewSize = 6;
  private updatables = new Set<Updatable>();
  private contentRoot: Object3D | null = null;
  private fitExclusions = new Set<Object3D>();
  private directionalLight: DirectionalLight | null = null;
  private readonly screenRayOrigin = new Vector3();
  private readonly screenRayTarget = new Vector3();
  private readonly screenRayDirection = new Vector3();
  private readonly screenIntersectionPoint = new Vector3();

  // --- Управление камерой ---
  private target = new Vector3(0, 0, 0);
  private orbitRadius = 1;
  private horizontalAngle = 0;
  private cameraHeightOffset = 0;
  private rotationStepSize = Math.PI / 24;
  private rotationStepAccumulator = 0;
  private rotationStepCallback: ((direction: 1 | -1) => void) | null = null;
  private rotationVelocity = 0;
  private pendingRotationDelta = 0;
  private rotationFriction = 1;
  private rotationVelocityThreshold = 1e-4;
  private rotationSensitivity = 0.005;
  private lastDeltaTime = 1 / 60;
  private zoom = 1;
  private targetZoom = 1;
  private zoomTransitionSpeed = 40;
  private readonly zoomEpsilon = 1e-4;

  /**
   * Создаёт приложение и привязывает его к контейнеру.
   * @param {ExpoWebGLRenderingContext} gl
   */
  constructor(private readonly gl: ExpoWebGLRenderingContext) {}

  /**
   * Инициализирует сцену, камеру, рендерер и базовый свет.
   * @returns {void}
   */
  init(): void {
    const { w, h } = this.size();
    this.scene = new Scene();
    this.scene.background = new Color("#000000");

    this.camera = this.makeCamera(w, h);
    this.camera.position.set(5, 4, 5);
    this.camera.lookAt(this.target);
    this.scene.add(this.camera);
    this.contentRoot = new Object3D();
    this.scene.add(this.contentRoot);
    const offset = new Vector3().copy(this.camera.position).sub(this.target);
    this.orbitRadius = Math.sqrt(offset.x ** 2 + offset.z ** 2);
    this.horizontalAngle = Math.atan2(offset.x, offset.z);
    this.cameraHeightOffset = offset.y;

    this.renderer = new Renderer({ gl: this.gl, antialias: false });
    configureRendererPhysicMaterials(this.renderer);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(1);

    this.scene.add(new AmbientLight(0xffffff, 1));
    const dir = new DirectionalLight(0xffffff, 5);
    this.directionalLight = dir;
    dir.position.copy(this.camera.position);
    dir.target.position.copy(this.target);
    this.scene.add(dir);
    this.scene.add(dir.target);
    this.updateDirectionalLight();

    this.render();
  }

  /**
   * Возвращает текущий размер контейнера.
   * @returns {{w:number,h:number}} Ширина и высота в пикселях.
   */
  private size(): { w: number; h: number } {
    const { drawingBufferWidth: w, drawingBufferHeight: h } = this.gl;
    return { w, h };
  }

  /**
   * Предоставляет размеры буфера рендеринга в пикселях для расчётов вьюпорта.
   * @returns {{ width: number; height: number } | null} Объект с шириной и высотой либо null.
   */
  getViewportSize(): { width: number; height: number } | null {
    const { w, h } = this.size();
    if (w === 0 || h === 0) {
      return null;
    }

    return { width: w, height: h };
  }

  /**
   * Создаёт ортографическую камеру под заданный размер вьюпорта.
   * @param {number} w Ширина.
   * @param {number} h Высота.
   * @returns {OrthographicCamera} Камера.
   */
  private makeCamera(w: number, h: number): OrthographicCamera {
    const aspect = w / h;
    const half = this.viewSize / 2;
    const cam = new OrthographicCamera(
      -half * aspect,
      half * aspect,
      half,
      -half,
      0.1,
      1000
    );
    cam.updateProjectionMatrix();
    return cam;
  }

  /**
   * Находит точку пересечения луча из экрана с горизонтальной плоскостью на заданной высоте.
   * @param {number} screenX Горизонтальная координата экрана в пикселях.
   * @param {number} screenY Вертикальная координата экрана в пикселях.
   * @param {number} planeY Высота плоскости в мировых координатах.
   * @returns {Vector3 | null} Точка пересечения в мировых координатах либо null, если пересечения нет.
   */
  screenPointToWorldOnPlane(
    screenX: number,
    screenY: number,
    planeY: number
  ): Vector3 | null {
    if (!this.camera) {
      return null;
    }

    const { w, h } = this.size();
    if (w === 0 || h === 0) {
      return null;
    }

    const ndcX = (screenX / w) * 2 - 1;
    const ndcY = -((screenY / h) * 2 - 1);

    const origin = this.screenRayOrigin
      .set(ndcX, ndcY, -1)
      .unproject(this.camera);
    const target = this.screenRayTarget
      .set(ndcX, ndcY, 1)
      .unproject(this.camera);
    const direction = this.screenRayDirection.copy(target).sub(origin);

    if (direction.lengthSq() === 0) {
      return null;
    }

    direction.normalize();
    const denominator = direction.y;

    if (Math.abs(denominator) < 1e-6) {
      return null;
    }

    const t = (planeY - origin.y) / denominator;

    if (!Number.isFinite(t) || t < 0) {
      return null;
    }

    return this.screenIntersectionPoint
      .copy(origin)
      .add(direction.multiplyScalar(t));
  }

  /**
   * Добавляет объект на сцену.
   * Если у объекта есть метод update, регистрирует его для кадровых обновлений.
   * При передаче флага excludeFromFit объект будет игнорироваться при fitToContent.
   * @param {Object3D} obj Трёхмерный объект.
   * @param {{ excludeFromFit?: boolean }} [options] Параметры добавления объекта.
   * @returns {void}
   */
  add(obj: Object3D, options?: { excludeFromFit?: boolean }): void {
    if (this.contentRoot) {
      this.contentRoot.add(obj);
    } else {
      this.scene.add(obj);
    }

    if (options?.excludeFromFit) {
      this.fitExclusions.add(obj);
    }

    const maybeUpdatable = obj as unknown as Partial<Updatable>;
    if (typeof maybeUpdatable.update === "function") {
      this.updatables.add(maybeUpdatable as Updatable);
    }
  }

  /**
   * Удаляет объект со сцены и дерегистриует из апдейтов.
   * Если у объекта есть метод dispose, вызывает его.
   * @param {Object3D} obj Трёхмерный объект.
   * @returns {void}
   */
  remove(obj: Object3D): void {
    if (this.contentRoot) {
      this.contentRoot.remove(obj);
    } else {
      this.scene.remove(obj);
    }
    this.fitExclusions.delete(obj);
    this.updatables.delete(obj as unknown as Updatable);
    const disposable = obj as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === "function") disposable.dispose();
  }

  /**
   * Вычисляет ограничивающий параллелепипед для объектов сцены, учитываемых fitToContent.
   * @returns {Box3 | null} Объём ограничивающего параллелепипеда или null, если нет объектов.
   */
  private computeFitBoundingBox(): Box3 | null {
    if (!this.contentRoot) {
      return null;
    }

    const box = new Box3();
    let hasBox = false;

    for (const child of this.contentRoot.children) {
      if (this.fitExclusions.has(child)) {
        continue;
      }

      const childBox = new Box3().setFromObject(child);
      if (!Number.isFinite(childBox.min.x) || childBox.isEmpty()) {
        continue;
      }

      if (!hasBox) {
        box.copy(childBox);
        hasBox = true;
      } else {
        box.union(childBox);
      }
    }

    return hasBox ? box : null;
  }

  /**
   * Очищает сцену от всех объектов кроме камеры и света.
   * Вызывает dispose у поддерживающих его объектов.
   * @returns {void}
   */
  clear(): void {
    if (this.contentRoot) {
      const toRemove = [...this.contentRoot.children];
      toRemove.forEach((child) => this.remove(child));
      return;
    }

    const keep = new Set([this.camera]);
    const toRemove: Object3D[] = [];
    this.scene.children.forEach((child) => {
      if (
        !keep.has(child as any) &&
        !(child instanceof AmbientLight) &&
        !(child instanceof DirectionalLight)
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((o) => this.remove(o));
  }

  /**
   * Кадровой цикл: обновляет Updatable-объекты и рендерит сцену.
   * @param {number} t Текущее время из requestAnimationFrame в мс.
   * @returns {void}
   */
  private loop = (t = 0): void => {
    const dt = this.last ? (t - this.last) / 1000 : 0;
    this.last = t;
    if (dt > 0) {
      this.lastDeltaTime = dt;
    }
    this.updateCameraRotation(dt);
    this.updateCameraZoom(dt);
    this.updatables.forEach((u) => u.update(dt));
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
    this.raf = requestAnimationFrame(this.loop);
  };

  /**
   * Запускает рендер-цикл.
   * @returns {void}
   */
  render(): void {
    cancelAnimationFrame(this.raf);
    this.last = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  /**
   * Освобождает ресурсы.
   * @returns {void}
   */
  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.renderer?.dispose();
    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      this.scene.remove(this.directionalLight.target);
      this.directionalLight = null;
    }
  }

  /**
   * Устанавливает масштаб ортографической камеры.
   * @param {number} z Новое значение zoom.
   * @returns {void}
   */
  setZoom(z: number): void {
    if (!Number.isFinite(z)) {
      return;
    }

    const nextZoom = Math.max(Number.EPSILON, z);
    this.zoom = nextZoom;
    this.targetZoom = nextZoom;
    this.camera.zoom = nextZoom;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Плавно изменяет zoom ортографической камеры к новому значению.
   * @param {number} z Желаемое значение zoom.
   * @returns {void}
   */
  smoothZoomTo(z: number): void {
    if (!Number.isFinite(z)) {
      return;
    }

    this.targetZoom = Math.max(Number.EPSILON, z);
  }

  /**
   * Возвращает целевое значение zoom для ортографической камеры.
   * @returns {number} Текущее целевое значение zoom.
   */
  getZoom(): number {
    return this.targetZoom;
  }

  /**
   * Поворачивает камеру вокруг целевой точки в горизонтальной плоскости.
   * @param {number} deltaX Изменение жеста по оси X в пикселях.
   * @returns {void}
   */
  rotateHorizontally(deltaX: number): void {
    if (!this.camera) return;
    if (this.orbitRadius === 0) return;

    const deltaAngle = -deltaX * this.rotationSensitivity;
    this.pendingRotationDelta += deltaAngle;
    const dt = this.lastDeltaTime || 1 / 60;
    this.rotationVelocity = deltaAngle / dt;
  }

  /**
   * Настраивает параметры инерции горизонтального вращения камеры.
   * @param {{ friction?: number; velocityThreshold?: number; sensitivity?: number }} options
   *   Объект с параметрами инерции.
   * @param {number} [options.friction]
   *   Коэффициент экспоненциального демпфирования угловой скорости: чем больше значение, тем
   *   быстрее скорость затухает после завершения жеста. Ноль отключает торможение.
   * @param {number} [options.velocityThreshold]
   *   Минимальная по модулю угловая скорость, при падении ниже которой инерция считается
   *   завершённой и дальнейшее вращение прекращается.
   * @param {number} [options.sensitivity]
   *   Множитель преобразования горизонтального жеста в радианы: влияет на скорость поворота
   *   камеры при перетаскивании, а также на исходную скорость инерции.
   * @returns {void}
   */
  setRotationInertia({
    friction,
    velocityThreshold,
    sensitivity,
  }: {
    friction?: number;
    velocityThreshold?: number;
    sensitivity?: number;
  }): void {
    if (typeof friction === "number" && Number.isFinite(friction)) {
      this.rotationFriction = Math.max(0, friction);
    }

    if (
      typeof velocityThreshold === "number" &&
      Number.isFinite(velocityThreshold)
    ) {
      this.rotationVelocityThreshold = Math.max(0, velocityThreshold);
    }

    if (typeof sensitivity === "number" && Number.isFinite(sensitivity)) {
      this.rotationSensitivity = Math.max(0, sensitivity);
    }
  }

  /**
   * Применяет изменение горизонтального угла камеры и обновляет позицию.
   * Также уведомляет обратный вызов о прохождении дискретных шагов.
   * @param {number} deltaAngle Изменение угла в радианах.
   * @returns {void}
   */
  private applyHorizontalAngleDelta(deltaAngle: number): void {
    this.horizontalAngle += deltaAngle;

    this.rotationStepAccumulator += deltaAngle;
    while (Math.abs(this.rotationStepAccumulator) >= this.rotationStepSize) {
      const direction = this.rotationStepAccumulator > 0 ? 1 : -1;
      this.rotationStepAccumulator -= this.rotationStepSize * direction;
      this.rotationStepCallback?.(direction);
    }

    this.updateCameraPositionFromOrbit();
  }

  /**
   * Обновляет вращение камеры с учётом инерции и накопленных изменений.
   * @param {number} dt Дельта времени между кадрами в секундах.
   * @returns {void}
   */
  private updateCameraRotation(dt: number): void {
    if (!this.camera) return;

    if (this.pendingRotationDelta !== 0) {
      this.applyHorizontalAngleDelta(this.pendingRotationDelta);
      this.pendingRotationDelta = 0;
    }

    if (Math.abs(this.rotationVelocity) <= this.rotationVelocityThreshold) {
      this.rotationVelocity = 0;
      return;
    }

    const damping = dt > 0 ? Math.exp(-this.rotationFriction * dt) : 1;
    this.rotationVelocity *= damping;

    if (Math.abs(this.rotationVelocity) <= this.rotationVelocityThreshold) {
      this.rotationVelocity = 0;
      return;
    }

    const deltaAngle =
      this.rotationVelocity * (dt > 0 ? dt : this.lastDeltaTime);
    this.applyHorizontalAngleDelta(deltaAngle);
  }

  /**
   * Постепенно приближает текущий zoom камеры к целевому значению.
   * @param {number} dt Время между кадрами в секундах.
   * @returns {void}
   */
  private updateCameraZoom(dt: number): void {
    if (!this.camera) {
      return;
    }

    const currentZoom = this.zoom;
    const targetZoom = this.targetZoom;
    if (Math.abs(currentZoom - targetZoom) <= this.zoomEpsilon) {
      this.zoom = targetZoom;
      const difference = Math.abs(this.camera.zoom - targetZoom);
      this.camera.zoom = targetZoom;
      if (difference > 0) {
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    const deltaTime = Math.max(0, dt);
    const factor =
      deltaTime > 0 ? 1 - Math.exp(-this.zoomTransitionSpeed * deltaTime) : 1;
    const nextZoom = currentZoom + (targetZoom - currentZoom) * factor;
    this.zoom = nextZoom;
    const differenceToNext = Math.abs(this.camera.zoom - nextZoom);
    this.camera.zoom = nextZoom;

    if (differenceToNext > 0) {
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Пересчитывает позицию камеры исходя из текущей орбиты вокруг цели.
   * @returns {void}
   */
  private updateCameraPositionFromOrbit(): void {
    if (!this.camera) return;
    const x = this.target.x + Math.sin(this.horizontalAngle) * this.orbitRadius;
    const z = this.target.z + Math.cos(this.horizontalAngle) * this.orbitRadius;
    const y = this.target.y + this.cameraHeightOffset;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
    this.updateDirectionalLight();
  }

  /**
   * Настраивает обратную связь при прохождении дискретных шагов вращения.
   * @param {number} stepAngle Угол в радианах между шагами вибрации.
   * @param {(direction: 1 | -1) => void} callback Колбэк, вызываемый при каждом шаге.
   * @returns {void}
   */
  setRotationStepFeedback(
    stepAngle: number,
    callback: (direction: 1 | -1) => void
  ): void {
    this.rotationStepSize = Math.max(Math.abs(stepAngle), Number.EPSILON);
    this.rotationStepAccumulator = 0;
    this.rotationStepCallback = callback;
  }

  /**
   * Подбирает zoom ортографической камеры так, чтобы весь контент попадал в кадр.
   * Центр кадра совмещается с центром сцены, а также учитывается заданный отступ.
   * @param {number} [marginRatio=0.1] Дополнительный отступ к размеру сцены (0.1 = 10%).
   * @returns {void}
   */
  fitToContent(marginRatio = 0.1): void {
    if (!this.camera) return;

    const box = this.computeFitBoundingBox();
    if (!box) {
      return;
    }

    const center = new Vector3();
    box.getCenter(center);
    this.target.copy(center);
    this.updateCameraPositionFromOrbit();

    this.camera.updateMatrixWorld(true);
    const matrix = new Matrix4().copy(this.camera.matrixWorldInverse);

    const forward = new Vector3()
      .subVectors(this.target, this.camera.position)
      .normalize();

    const corners = [
      new Vector3(box.min.x, box.min.y, box.min.z),
      new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.min.z),
      new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.min.z),
      new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.min.z),
      new Vector3(box.max.x, box.max.y, box.max.z),
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minCameraZ = Infinity;
    let maxCameraZ = -Infinity;

    corners.forEach((corner) => {
      const projected = corner.clone().applyMatrix4(matrix);
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
      minCameraZ = Math.min(minCameraZ, projected.z);
      maxCameraZ = Math.max(maxCameraZ, projected.z);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    const baseWidth = this.camera.right - this.camera.left;
    const baseHeight = this.camera.top - this.camera.bottom;
    const marginMultiplier = 1 + Math.max(0, marginRatio);

    const effectiveWidth = Math.max(width * marginMultiplier, Number.EPSILON);
    const effectiveHeight = Math.max(height * marginMultiplier, Number.EPSILON);

    const zoomX = baseWidth / effectiveWidth;
    const zoomY = baseHeight / effectiveHeight;
    const nextZoom = Math.min(zoomX, zoomY);

    if (Number.isFinite(nextZoom) && nextZoom > 0) {
      this.setZoom(nextZoom);
    }

    if (
      forward.lengthSq() > 0 &&
      Number.isFinite(minCameraZ) &&
      Number.isFinite(maxCameraZ)
    ) {
      const frontDistance = -maxCameraZ;
      const backDistance = -minCameraZ;
      const depth = Math.max(backDistance - frontDistance, Number.EPSILON);
      const depthMargin = depth * Math.max(0, marginRatio);

      let paddedFrontDistance = frontDistance - depthMargin;
      let paddedBackDistance = backDistance + depthMargin;

      const minNear = 0.01;

      if (paddedFrontDistance <= minNear) {
        const shift = minNear - paddedFrontDistance;
        if (Number.isFinite(shift) && shift > 0) {
          this.camera.position.addScaledVector(forward, -shift);
          this.camera.lookAt(this.target);
          paddedFrontDistance += shift;
          paddedBackDistance += shift;

          const updatedOffset = new Vector3()
            .copy(this.camera.position)
            .sub(this.target);
          this.orbitRadius = Math.hypot(updatedOffset.x, updatedOffset.z);
          this.cameraHeightOffset = updatedOffset.y;
        }
      }

      const desiredNear = Math.max(minNear, paddedFrontDistance);
      const desiredFar = Math.max(desiredNear + 1, paddedBackDistance);

      if (Number.isFinite(desiredNear) && Number.isFinite(desiredFar)) {
        this.camera.near = desiredNear;
        this.camera.far = desiredFar;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /**
   * Синхронизирует позицию и направление направленного света с камерой и целевой точкой.
   * @returns {void}
   */
  private updateDirectionalLight(): void {
    if (!this.directionalLight || !this.camera) {
      return;
    }

    this.directionalLight.position.copy(this.camera.position);
    this.directionalLight.target.position.copy(this.target);
    this.directionalLight.target.updateMatrixWorld();
  }
}
