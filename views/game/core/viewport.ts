import type { ExpoWebGLRenderingContext } from "expo-gl";
import { Renderer } from "expo-three";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Object3D,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { EventName, type Extension, type FX } from "./types";

type FXRegistry<TKey extends string = string> = Record<TKey, FX>;

export class Viewport<TFx extends FXRegistry = FXRegistry> {
  readonly scene: Scene = new Scene();
  readonly renderer!: WebGLRenderer;
  readonly camera!: OrthographicCamera;
  readonly light!: DirectionalLight;

  private target = new Vector3(0, 0, 0);

  private readonly fxStore: FXRegistry = {};

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
    if (effects.length > 0) {
      effects.forEach((fx) => fx.render());
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
  useFX<Name extends string, Effect extends FX>(
    name: Name,
    fx: Effect
  ): Viewport<TFx & Record<Name, Effect>> {
    fx.setSize(this.size.width, this.size.height);
    this.fxStore[name] = fx;

    return this as unknown as Viewport<TFx & Record<Name, Effect>>;
  }
}
