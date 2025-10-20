import type { ExpoWebGLRenderingContext } from "expo-gl";
import { Renderer } from "expo-three";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Mesh,
  Object3D,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

import { EventName, type Extension, type FX } from "./types";

type FXRegistry<TKey extends string = string> = Record<TKey, FX<unknown[]>>;

export class Viewport<TFx extends FXRegistry = FXRegistry> {
  scene: Scene = new Scene();
  renderer!: WebGLRenderer;
  camera!: OrthographicCamera;
  light!: DirectionalLight;

  private target = new Vector3(0, 0, 0);

  private readonly fxStore: Record<string, FX<unknown[]>> = {};

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private outputPass: OutputPass | null = null;

  private events: { [K in EventName]: ((data: unknown) => void)[] } = {
    [EventName.ROTATION_STEP]: [],
    [EventName.INIT]: [],
    [EventName.LOOP]: [],
  };

  /**
   * Создаёт экземпляр вьюпорта для работы с WebGL-контекстом.
   * @param {ExpoWebGLRenderingContext} gl Графический контекст Expo.
   */
  constructor(private readonly gl: ExpoWebGLRenderingContext) {}

  /**
   * Инициализирует основные сущности сцены: камеру, рендерер и освещение.
   * @returns {this} Возвращает текущий экземпляр для чейнинга.
   */
  init(): this {
    const { width, height } = this.size;
    this.scene.background = new Color(0x000000);

    this.initCamera(width, height);
    this.initRenderer(width, height);
    this.initLight(this.camera.position);

    this.emit(EventName.INIT);

    return this;
  }

  /**
   * Возвращает зарегистрированные эффекты с сохранением типов.
   * @returns {TFx} Коллекция эффектов, доступных вьюпорту.
   */
  get fx(): TFx {
    return this.fxStore as TFx;
  }

  /**
   * Настраивает ортографическую камеру на основе размеров сцены.
   * @param {number} width Текущая ширина сцены.
   * @param {number} height Текущая высота сцены.
   */
  private initCamera(width: number, height: number): void {
    const aspect = width / height;
    const half = 6 / 2;
    this.camera = new OrthographicCamera(
      -half * aspect,
      half * aspect,
      half,
      -half,
      0.1,
      1000
    );
    this.camera.updateProjectionMatrix();
    this.camera.position.set(5, 4, 5);
    this.camera.lookAt(this.target);
    this.scene.add(this.camera);
  }

  /**
   * Создаёт и настраивает рендерер для текущего контекста.
   * @param {number} width Ширина буфера рендеринга.
   * @param {number} height Высота буфера рендеринга.
   */
  private initRenderer(width: number, height: number): void {
    this.renderer = new Renderer({
      gl: this.gl,
      width,
      height,
      antialias: true,
      pixelRatio: 1,
    });
  }

  /**
   * Подготавливает источники освещения сцены.
   * @param {Vector3} position Позиция основного источника света.
   */
  private initLight(position: Vector3): void {
    this.light = new DirectionalLight(0xffffff, 1);
    this.light.position.copy(position);
    this.light.target.position.copy(this.target);
    this.scene.add(new AmbientLight(0xffffff, 1));
    this.scene.add(this.light);
    this.scene.add(this.light.target);
  }

  /**
   * Основной цикл рендеринга, запускаемый на каждом кадре.
   * @param {number} [t=0] Текущее время анимации.
   */
  private loop = (t = 0): void => {
    this.emit(EventName.LOOP, t);
    const effects = Object.values(this.fxStore);
    if (this.composer) {
      if (this.renderPass) {
        this.renderPass.camera = this.camera;
        this.renderPass.scene = this.scene;
      }
      effects.forEach((fx) => fx.render());
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.gl.endFrameEXP();
  };

  /**
   * Запускает цикл рендеринга.
   * @returns {this} Возвращает текущий экземпляр для чейнинга.
   */
  render(): this {
    this.renderer.setAnimationLoop(this.loop);
    return this;
  }

  /**
   * Добавляет один или несколько объектов на сцену.
   * @param {Object3D | Object3D[]} obj Объект либо список объектов Three.js.
   * @returns {this} Возвращает текущий экземпляр для чейнинга.
   */
  add(obj: Object3D[] | Object3D): this {
    if (Array.isArray(obj)) {
      this.scene.add(...obj);
    } else {
      this.scene.add(obj);
    }
    return this;
  }

  /**
   * Удаляет объект со сцены и вызывает его dispose при наличии.
   * @param {Object3D} obj Удаляемый объект сцены.
   */
  remove(obj: Object3D): void {
    this.scene.remove(obj);
    const disposable = obj as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === "function") disposable.dispose();
  }

  /** Удаляет все вспомогательные объекты со сцены, кроме камеры и света. */
  clear(): void {
    const keep = new Set<Object3D>([this.camera]);
    const toRemove: Object3D[] = [];
    this.scene.children.forEach((child) => {
      if (
        !keep.has(child) &&
        !(child instanceof AmbientLight) &&
        !(child instanceof DirectionalLight)
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((o) => this.remove(o));
  }

  /**
   * Отправляет событие подписчикам внутри вьюпорта.
   * @param {EventName} event Имя события.
   * @param {unknown} [data] Дополнительные данные события.
   */
  private emit(event: EventName, data?: unknown): void {
    if (this.events[event]) {
      this.events[event].forEach((cb) => cb(data));
    }
  }

  /**
   * Подписывает обработчик на событие вьюпорта.
   * @param {EventName} event Имя события.
   * @param {(data: unknown) => void} cb Обработчик события.
   * @returns {this} Возвращает текущий экземпляр для чейнинга.
   */
  on(event: EventName, cb: (data: unknown) => void): this {
    if (this.events[event]) {
      this.events[event].push(cb);
    } else {
      throw new Error("Недопустимое название события.");
    }
    return this;
  }

  /**
   * Возвращает актуальные размеры буфера рендеринга.
   * @returns {{ width: number; height: number }} Параметры размера сцены.
   */
  get size(): { width: number; height: number } {
    const { drawingBufferWidth: width, drawingBufferHeight: height } = this.gl;
    return { width, height };
  }

  /**
   * Подключает расширение к текущему вьюпорту.
   * @param {Extension<Viewport<TFx>>} extension Экземпляр расширения.
   * @returns {this} Возвращает текущий экземпляр для чейнинга.
   */
  use(extension: Extension<Viewport<TFx>>): this {
    extension.setup(this);
    return this;
  }

  /**
   * Регистрирует пост-обработку и сохраняет её тип для автодополнения.
   * @param {Name} name Уникальное имя эффекта.
   * @param {Effect} fx Экземпляр эффекта.
   * @returns {Viewport<TFx & Record<Name, Effect>>} Вьюпорт с учётом нового эффекта.
   */
  useFX<Name extends string, Effect extends FX<unknown[]>>(
    name: Name,
    fx: Effect
  ): Viewport<TFx & Record<Name, Effect>> {
    this.ensureComposer();
    const pass = fx.setup(
      this.renderer,
      this.scene,
      this.camera,
      this.composer as EffectComposer
    );
    this.insertPass(pass);
    fx.setSize(this.size.width, this.size.height);
    this.fxStore[name] = fx;

    return this as unknown as Viewport<TFx & Record<Name, Effect>>;
  }

  /**
   * Гарантирует наличие общего композера пост-эффектов.
   * @returns {void}
   */
  private ensureComposer(): void {
    if (this.composer) {
      return;
    }

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.outputPass);
    this.composer.setSize(this.size.width, this.size.height);
  }

  /**
   * Вставляет новый проход перед выходным проходом композера.
   * @param {Pass} pass Экземпляр прохода, добавляемого в цепочку.
   * @returns {void}
   */
  private insertPass(pass: Pass): void {
    if (!this.composer || !this.outputPass) {
      return;
    }

    const passes = this.composer.passes;
    const index = passes.indexOf(this.outputPass);

    if (index === -1) {
      this.composer.addPass(pass);
    } else {
      passes.splice(index, 0, pass);
    }
  }

  /**
   * Подгоняет параметры камеры под выбранный объект сцены с плавным переходом.
   * @param {Mesh} obj Объект, который необходимо полностью вместить в кадр.
   * @param {number} [duration=2000] Продолжительность анимации в миллисекундах.
   * @param {number} [margin=0.1] Дополнительный относительный отступ вокруг объекта.
   * @returns {Promise<void>} Промис, завершающийся после окончания анимации.
   */
  async fitToObject(obj: Mesh, duration = 2000, margin = 0.1): Promise<void> {
    const targetBox = new Box3();
    targetBox.setFromObject(obj);

    if (targetBox.isEmpty()) {
      return;
    }

    const safeMargin = Math.max(0, margin);

    const center = targetBox.getCenter(new Vector3());
    const cameraOffset = this.camera.position.clone().sub(this.target);
    const lightOffset = this.light.position
      .clone()
      .sub(this.light.target.position);

    const targetPosition = center.clone().add(cameraOffset);
    const targetLightPosition = center.clone().add(lightOffset);
    const targetLightTarget = center.clone();

    const cameraClone = this.camera.clone();
    cameraClone.position.copy(targetPosition);
    cameraClone.lookAt(targetLightTarget);
    cameraClone.updateMatrixWorld(true);

    const points = [
      new Vector3(targetBox.min.x, targetBox.min.y, targetBox.min.z),
      new Vector3(targetBox.min.x, targetBox.min.y, targetBox.max.z),
      new Vector3(targetBox.min.x, targetBox.max.y, targetBox.min.z),
      new Vector3(targetBox.min.x, targetBox.max.y, targetBox.max.z),
      new Vector3(targetBox.max.x, targetBox.min.y, targetBox.min.z),
      new Vector3(targetBox.max.x, targetBox.min.y, targetBox.max.z),
      new Vector3(targetBox.max.x, targetBox.max.y, targetBox.min.z),
      new Vector3(targetBox.max.x, targetBox.max.y, targetBox.max.z),
    ];

    const cameraMatrix = cameraClone.matrixWorldInverse.clone();

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    points.forEach((point) => {
      const projected = point.clone().applyMatrix4(cameraMatrix);
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
      minZ = Math.min(minZ, projected.z);
      maxZ = Math.max(maxZ, projected.z);
    });

    const baseWidth = this.camera.right - this.camera.left;
    const baseHeight = this.camera.top - this.camera.bottom;
    const targetWidth = (maxX - minX) * (1 + safeMargin);
    const targetHeight = (maxY - minY) * (1 + safeMargin);

    const widthZoom = baseWidth / (targetWidth || 1);
    const heightZoom = baseHeight / (targetHeight || 1);
    const zoom = Math.max(Math.min(widthZoom, heightZoom), Number.EPSILON);

    const depth = Math.abs(maxZ - minZ);
    const depthPadding = depth * safeMargin;
    const near = Math.max(0.1, -maxZ - depthPadding);
    const far = Math.max(near + 0.1, -minZ + depthPadding);

    if (duration <= 0) {
      this.target.copy(center);
      this.camera.position.copy(targetPosition);
      this.camera.lookAt(this.target);

      this.light.position.copy(targetLightPosition);
      this.light.target.position.copy(this.target);
      this.light.target.updateMatrixWorld();

      this.camera.zoom = zoom;
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);

      return;
    }

    const startTarget = this.target.clone();
    const startCameraPosition = this.camera.position.clone();
    const startLightPosition = this.light.position.clone();
    const startLightTarget = this.light.target.position.clone();
    const startZoom = this.camera.zoom;
    const startNear = this.camera.near;
    const startFar = this.camera.far;

    const targetTarget = center.clone();

    const tempTarget = new Vector3();
    const tempCameraPosition = new Vector3();
    const tempLightPosition = new Vector3();
    const tempLightTarget = new Vector3();

    const getNow = (): number =>
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const schedule = (callback: (time: number) => void): void => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(callback);
      } else {
        setTimeout(() => callback(getNow()), 16);
      }
    };

    const startTime = getNow();

    const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

    await new Promise<void>((resolve) => {
      const step = (currentTime: number): void => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = ease(progress);

        this.target.copy(
          tempTarget.copy(startTarget).lerp(targetTarget, eased)
        );
        this.camera.position.copy(
          tempCameraPosition
            .copy(startCameraPosition)
            .lerp(targetPosition, eased)
        );
        this.camera.lookAt(this.target);

        this.light.position.copy(
          tempLightPosition
            .copy(startLightPosition)
            .lerp(targetLightPosition, eased)
        );

        this.light.target.position.copy(
          tempLightTarget.copy(startLightTarget).lerp(targetLightTarget, eased)
        );
        this.light.target.updateMatrixWorld();

        this.camera.zoom = startZoom + (zoom - startZoom) * eased;
        this.camera.near = startNear + (near - startNear) * eased;
        this.camera.far = startFar + (far - startFar) * eased;
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld(true);

        if (progress < 1) {
          schedule(step);
        } else {
          resolve();
        }
      };

      schedule(step);
    });
  }
}
