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
  PMREMGenerator,
  WebGLRenderTarget,
  Box3,
  Matrix4,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
  private pmremGenerator: PMREMGenerator | null = null;
  private environmentTarget: WebGLRenderTarget | null = null;
  private contentRoot: Object3D | null = null;

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
    this.scene.background = new Color("#181818");

    this.camera = this.makeCamera(w, h);
    this.camera.position.set(5, 4, 5);
    this.camera.lookAt(this.target);
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

    this.scene.add(new AmbientLight(0xffffff, 1.1));
    const dir = new DirectionalLight(0xffffff, 1.4);
    dir.position.set(5, 8, 3);
    this.scene.add(dir);

    this.setupEnvironment();

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
   * Добавляет объект на сцену.
   * Если у объекта есть метод update, регистрирует его для кадровых обновлений.
   * @param {Object3D} obj Трёхмерный объект.
   * @returns {void}
   */
  add(obj: Object3D): void {
    if (this.contentRoot) {
      this.contentRoot.add(obj);
    } else {
      this.scene.add(obj);
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
    this.updatables.delete(obj as unknown as Updatable);
    const disposable = obj as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === "function") disposable.dispose();
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
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.pmremGenerator?.dispose();
    this.pmremGenerator = null;
    this.renderer?.dispose();
  }

  /**
   * Устанавливает масштаб ортографической камеры.
   * @param {number} z Новое значение zoom.
   * @returns {void}
   */
  setZoom(z: number): void {
    this.camera.zoom = z;
    this.camera.updateProjectionMatrix();
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
   * Создаёт HDR-окружение для отражающих материалов и стекла.
   * @returns {void}
   */
  private setupEnvironment(): void {
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.pmremGenerator?.dispose();
    this.pmremGenerator = new PMREMGenerator(this.renderer);
    this.pmremGenerator.compileCubemapShader();
    const room = new RoomEnvironment();
    const target = this.pmremGenerator.fromScene(room, 0.04);
    room.dispose();
    this.environmentTarget = target;
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 1.5;
  }

  /**
   * Подбирает zoom ортографической камеры так, чтобы весь контент попадал в кадр.
   * Центр кадра совмещается с центром сцены, а также учитывается заданный отступ.
   * @param {number} [marginRatio=0.1] Дополнительный отступ к размеру сцены (0.1 = 10%).
   * @returns {void}
   */
  fitToContent(marginRatio = 0.1): void {
    if (!this.camera || !this.contentRoot) return;

    const box = new Box3().setFromObject(this.contentRoot);
    if (!Number.isFinite(box.min.x) || box.isEmpty()) {
      return;
    }

    const center = new Vector3();
    box.getCenter(center);
    this.target.copy(center);
    this.updateCameraPositionFromOrbit();

    this.camera.updateMatrixWorld(true);
    const matrix = new Matrix4().copy(this.camera.matrixWorldInverse);

    const cameraPosition = this.camera.position.clone();
    const forward = new Vector3()
      .subVectors(this.target, cameraPosition)
      .normalize();

    let minDistance = Infinity;
    let maxDistance = -Infinity;

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

    corners.forEach((corner) => {
      const projected = corner.clone().applyMatrix4(matrix);
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
      if (forward.lengthSq() > 0) {
        const toCorner = corner.clone().sub(cameraPosition);
        const distance = toCorner.dot(forward);
        minDistance = Math.min(minDistance, distance);
        maxDistance = Math.max(maxDistance, distance);
      }
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

    if (forward.lengthSq() > 0) {
      const depth = Math.max(maxDistance - minDistance, Number.EPSILON);
      const depthMargin = depth * Math.max(0, marginRatio);

      let paddedMinDistance = minDistance - depthMargin;
      let paddedMaxDistance = maxDistance + depthMargin;

      const minNear = 0.1;

      if (paddedMinDistance <= minNear) {
        const shift = minNear - paddedMinDistance;
        if (Number.isFinite(shift) && shift > 0) {
          this.camera.position.addScaledVector(forward, -shift);
          this.camera.lookAt(this.target);
          paddedMinDistance += shift;
          paddedMaxDistance += shift;

          const updatedOffset = new Vector3()
            .copy(this.camera.position)
            .sub(this.target);
          this.orbitRadius = Math.hypot(updatedOffset.x, updatedOffset.z);
          this.cameraHeightOffset = updatedOffset.y;
        }
      }

      this.camera.updateMatrixWorld(true);

      const desiredNear = Math.max(minNear, paddedMinDistance);
      const desiredFar = Math.max(desiredNear + 1, paddedMaxDistance);

      if (Number.isFinite(desiredNear) && Number.isFinite(desiredFar)) {
        this.camera.near = desiredNear;
        this.camera.far = desiredFar;
        this.camera.updateProjectionMatrix();
      }
    }
  }
}
