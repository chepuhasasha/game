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
} from "three";
import type { Updatable } from "./updatable";
import { Renderer } from "expo-three";
import { configureRendererForGlass } from "./materials";

export class Viewport {
  private scene!: Scene;
  private renderer!: WebGLRenderer;
  private camera!: OrthographicCamera;
  private raf = 0;
  private last = 0;
  private viewSize = 6;
  private updatables = new Set<Updatable>();

  // --- Управление камерой ---
  private target = new Vector3(0, 0, 0);

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
    this.scene.background = new Color("#111");

    this.camera = this.makeCamera(w, h);
    this.camera.position.set(5, 4, 5);
    this.camera.lookAt(this.target);

    this.renderer = new Renderer({ gl: this.gl, antialias: false });
    configureRendererForGlass(this.renderer);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(1);

    this.scene.add(new AmbientLight(0xffffff, 0.7));
    const dir = new DirectionalLight(0xffffff, 1);
    dir.position.set(5, 8, 3);
    this.scene.add(dir);

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
    this.scene.add(obj);
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
    this.scene.remove(obj);
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
  }

  /**
   * Устанавливает кратность приближения ортографической камеры.
   * @param {number} z Новое значение zoom (1 = без изменений).
   * @returns {void}
   */
  setZoom(z: number): void {
    this.camera.zoom = z;
    this.camera.updateProjectionMatrix();
  }
}
