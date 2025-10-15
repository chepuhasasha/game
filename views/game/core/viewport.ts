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
import { EventName, Extension, FX } from "./types";

export class Viewport {
  readonly scene: Scene = new Scene();
  readonly renderer!: WebGLRenderer;
  readonly camera!: OrthographicCamera;
  readonly light!: DirectionalLight;

  private target = new Vector3(0, 0, 0);

  public fx: { [name: string]: FX } = {};

  constructor(private readonly gl: ExpoWebGLRenderingContext) {}

  init() {
    const { width, height } = this.size;
    this.scene.background = new Color(0x000000);

    this.initCamera(width, height);
    this.initRanderer(width, height);
    this.initLight(this.camera.position);

    this.emit(EventName.INIT);

    return this;
  }

  private initCamera(width: number, height: number) {
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
  private initRanderer(width: number, height: number) {
    this.renderer = new Renderer({
      gl: this.gl,
      width,
      height,
      antialias: true,
      pixelRatio: 1,
    });
  }
  private initLight(position: Vector3) {
    this.light = new DirectionalLight(0xffffff, 1);
    this.light.position.copy(position);
    this.light.target.position.copy(this.target);
    this.scene.add(new AmbientLight(0xffffff, 1));
    this.scene.add(this.light);
    this.scene.add(this.light.target);
  }

  private loop = (t = 0): void => {
    this.emit(EventName.LOOP, t);
    const effects = Object.values(this.fx);
    if (effects.length > 0) {
      effects.forEach((fx) => fx.render());
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.gl.endFrameEXP();
  };

  render() {
    this.renderer.setAnimationLoop(this.loop);
    return this;
  }

  add(obj: Object3D[] | Object3D) {
    if (Array.isArray(obj)) {
      this.scene.add(...obj);
    } else {
      this.scene.add(obj);
    }
    return this;
  }

  remove(obj: Object3D): void {
    this.scene.remove(obj);
    const disposable = obj as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === "function") disposable.dispose();
  }

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

  private events: { [k in EventName]: ((data: any) => void)[] } = {
    [EventName.ROTATION_STEP]: [],
    [EventName.INIT]: [],
    [EventName.LOOP]: [],
  };
  private emit(event: EventName, data?: any) {
    if (this.events[event]) {
      this.events[event].forEach((cb) => cb(data));
    }
  }
  on(event: EventName, cb: (data: any) => void) {
    if (this.events[event]) {
      this.events[event].push(cb);
    } else {
      throw "Недопустимое название события.";
    }
    return this;
  }

  get size(): { width: number; height: number } {
    const { drawingBufferWidth: width, drawingBufferHeight: height } = this.gl;
    return { width, height };
  }

  use(ext: Extension) {
    ext.setup(this);
    return this;
  }

  useFX(name: string, fx: FX) {
    fx.setSize(this.size.width, this.size.height);
    this.fx[name] = fx;

    return this;
  }
}
