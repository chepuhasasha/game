import {
  Camera,
  NoBlending,
  NoToneMapping,
  Scene,
  SRGBColorSpace,
  Uniform,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Значения uniforms по умолчанию. */
const FX_DEFAULTS = Object.freeze({
  strength: 1.0,
  scale: 2.3,
  threshold: 1.0,
  edge: 0.0,
});

/** Стандартная длительность анимации перехода в миллисекундах. */
const FX_ANIMATION_MS = 800;

/** GLSL-функции для генерации двумерного simplex-шуму. */
const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));
    vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
    vec3 p=permute( permute(i.y+vec3(0.,i1.y,1.))+ i.x+vec3(0.,i1.x,1.) );
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
    m*=m; m*=m; vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.*dot(m,g);
  }
`;

/** Тип промежуточной информации об анимации порога. */
type ThresholdAnimation = {
  from: number;
  to: number;
  start: number;
  duration: number;
  frame: number;
  resolve: () => void;
};

/**
 * Ограничивает значение диапазоном [0, 1].
 * @param {number} value Исходное значение.
 * @returns {number} Значение, зажатое в пределах [0, 1].
 */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Обеспечивает применение тонемаппинга и цветового пространства рендерера внутри OutputPass.
 */
class BlackoutOutputPass extends OutputPass {
  private settings: {
    outputColorSpace: WebGLRenderer["outputColorSpace"];
    toneMapping: WebGLRenderer["toneMapping"];
    toneMappingExposure: number;
  };

  /**
   * Создаёт OutputPass с сохранёнными настройками рендерера.
   * @param {{
   *   outputColorSpace: WebGLRenderer["outputColorSpace"];
   *   toneMapping: WebGLRenderer["toneMapping"];
   *   toneMappingExposure: number;
   * }} initialSettings Стартовые параметры рендерера.
   */
  constructor(initialSettings: {
    outputColorSpace: WebGLRenderer["outputColorSpace"];
    toneMapping: WebGLRenderer["toneMapping"];
    toneMappingExposure: number;
  }) {
    super();
    this.settings = { ...initialSettings };
  }

  /**
   * Обновляет сохранённые настройки для применения при рендеринге OutputPass.
   * @param {{
   *   outputColorSpace: WebGLRenderer["outputColorSpace"];
   *   toneMapping: WebGLRenderer["toneMapping"];
   *   toneMappingExposure: number;
   * }} nextSettings Актуальные параметры рендерера.
   * @returns {void}
   */
  setSettings(nextSettings: {
    outputColorSpace: WebGLRenderer["outputColorSpace"];
    toneMapping: WebGLRenderer["toneMapping"];
    toneMappingExposure: number;
  }): void {
    this.settings = { ...nextSettings };
  }

  /**
   * Выполняет рендер с временным применением исходных настроек тонемаппинга.
   * @param {WebGLRenderer} renderer Активный рендерер.
   * @param {WebGLRenderTarget | null} writeBuffer Целевой буфер рендеринга.
   * @param {WebGLRenderTarget} readBuffer Буфер с результатом предыдущего прохода.
   * @param {number} [deltaTime] Дельта времени между кадрами.
   * @param {boolean} [maskActive] Флаг активности маски.
   * @returns {void}
   */
  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget | null,
    readBuffer: WebGLRenderTarget,
    deltaTime?: number,
    maskActive?: boolean
  ): void {
    const previousState = {
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      toneMappingExposure: renderer.toneMappingExposure,
    };

    renderer.outputColorSpace = this.settings.outputColorSpace;
    renderer.toneMapping = this.settings.toneMapping;
    renderer.toneMappingExposure = this.settings.toneMappingExposure;

    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);

    renderer.outputColorSpace = previousState.outputColorSpace;
    renderer.toneMapping = previousState.toneMapping;
    renderer.toneMappingExposure = previousState.toneMappingExposure;
  }
}

export class BlackoutFX {
  private readonly composer: EffectComposer;

  private readonly renderPass: RenderPass;

  private readonly shaderPass: ShaderPass;

  private readonly outputPass: BlackoutOutputPass;

  private readonly uniforms: {
    strength: Uniform<number>;
    scale: Uniform<number>;
    threshold: Uniform<number>;
    edge: Uniform<number>;
  };

  private animation: ThresholdAnimation | null = null;

  private readonly originalRendererSettings: {
    outputColorSpace: WebGLRenderer["outputColorSpace"];
    toneMapping: WebGLRenderer["toneMapping"];
    toneMappingExposure: number;
  };

  /**
   * Синхронизирует снимок настроек рендерера и OutputPass перед включением эффекта.
   * @returns {void}
   */
  private captureRendererSettings(): void {
    this.originalRendererSettings.outputColorSpace = this.renderer.outputColorSpace;
    this.originalRendererSettings.toneMapping = this.renderer.toneMapping;
    this.originalRendererSettings.toneMappingExposure =
      this.renderer.toneMappingExposure;
    this.outputPass.setSettings(this.originalRendererSettings);
  }

  /**
   * Создаёт пост-эффект затемнения на основе simplex-шуму.
   * @param {WebGLRenderer} renderer Активный WebGL-рендерер.
   * @param {Scene} scene Сцена для рендера.
   * @param {Camera} camera Камера, используемая при рендеринге.
   */
  constructor(
    private readonly renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera
  ) {
    this.renderPass = new RenderPass(scene, camera);
    this.shaderPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        strength: { value: FX_DEFAULTS.strength },
        scale: { value: FX_DEFAULTS.scale },
        threshold: { value: FX_DEFAULTS.threshold },
        edge: { value: FX_DEFAULTS.edge },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float strength, scale, threshold, edge;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main(){
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float n = snoise(vUv * scale);
          n = 0.5 * n + 0.5;
          float mask = smoothstep(threshold + edge, threshold - edge, n);
          float alpha = mask * strength;
          col = mix(col, vec3(0.0), alpha);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.shaderPass.material.toneMapped = false;
    this.shaderPass.material.depthTest = false;
    this.shaderPass.material.blending = NoBlending;

    const initialSettings = {
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      toneMappingExposure: renderer.toneMappingExposure,
    };
    this.outputPass = new BlackoutOutputPass(initialSettings);
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.shaderPass);
    this.composer.addPass(this.outputPass);

    this.uniforms = this.shaderPass.uniforms as typeof this.shaderPass.uniforms & {
      strength: Uniform<number>;
      scale: Uniform<number>;
      threshold: Uniform<number>;
      edge: Uniform<number>;
    };

    this.shaderPass.enabled = false;

    this.originalRendererSettings = { ...initialSettings };

    this.applyRendererOverrides();

    this.setThreshold(0);
    this.enable();
  }

  /**
   * Применяет изменения настроек рендерера, необходимые для корректной работы эффекта.
   * @returns {void}
   */
  private applyRendererOverrides(): void {
    this.captureRendererSettings();
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.toneMappingExposure = this.originalRendererSettings.toneMappingExposure;
  }

  /**
   * Восстанавливает исходные параметры рендерера после отключения эффекта.
   * @returns {void}
   */
  private restoreRendererSettings(): void {
    this.renderer.outputColorSpace = this.originalRendererSettings.outputColorSpace;
    this.renderer.toneMapping = this.originalRendererSettings.toneMapping;
    this.renderer.toneMappingExposure = this.originalRendererSettings.toneMappingExposure;
  }

  /**
   * Обновляет сцену и камеру, используемые рендер-проходом.
   * @param {Scene} scene Актуальная сцена.
   * @param {Camera} camera Актуальная камера.
   * @returns {void}
   */
  setTarget(scene: Scene, camera: Camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  /**
   * Устанавливает размеры композитора в пикселях.
   * @param {number} width Ширина буфера рендеринга.
   * @param {number} height Высота буфера рендеринга.
   * @returns {void}
   */
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /**
   * Активирует затемняющий шейдерный проход.
   * @returns {void}
   */
  enable(): void {
    this.shaderPass.enabled = true;
  }

  /**
   * Выключает затемняющий шейдерный проход.
   * @returns {void}
   */
  disable(): void {
    this.shaderPass.enabled = false;
  }

  /**
   * Проверяет, активен ли эффект затемнения.
   * @returns {boolean} true, если эффект включён.
   */
  isEnabled(): boolean {
    return this.shaderPass.enabled;
  }

  /**
   * Устанавливает силу затемнения.
   * @param {number} value Новое значение силы эффекта.
   * @returns {void}
   */
  setStrength(value: number): void {
    this.uniforms.strength.value = value;
  }

  /**
   * Устанавливает масштаб шума, определяющий размер клякс.
   * @param {number} value Новое значение масштаба.
   * @returns {void}
   */
  setScale(value: number): void {
    this.uniforms.scale.value = value;
  }

  /**
   * Устанавливает порог видимости клякс.
   * @param {number} value Порог в диапазоне [0, 1].
   * @returns {void}
   */
  setThreshold(value: number): void {
    this.uniforms.threshold.value = clamp01(value);
  }

  /**
   * Устанавливает ширину перехода между видимой и скрытой зоной.
   * @param {number} value Значение edge.
   * @returns {void}
   */
  setEdge(value: number): void {
    this.uniforms.edge.value = value;
  }

  /**
   * Плавно включает затемнение, анимируя порог от 1 к 0.
   * @returns {Promise<void>} Промис, выполняющийся по завершении анимации.
   */
  async hide(): Promise<void> {
    this.enable();
    await this.animateThreshold(0.0);
  }

  /**
   * Плавно отключает затемнение, анимируя порог от 0 к 1.
   * @returns {Promise<void>} Промис, выполняющийся по завершении анимации.
   */
  async show(): Promise<void> {
    await this.animateThreshold(1.0);
    this.disable();
  }

  /**
   * Выполняет рендер сцены с учётом композитора.
   * @param {Scene} scene Сцена для рендеринга.
   * @param {Camera} camera Камера для рендеринга.
   * @returns {void}
   */
  render(scene: Scene, camera: Camera): void {
    if (this.renderPass.scene !== scene) {
      this.renderPass.scene = scene;
    }

    if (this.renderPass.camera !== camera) {
      this.renderPass.camera = camera;
    }

    this.composer.render();
  }

  /**
   * Освобождает ресурсы и отменяет активную анимацию.
   * @returns {void}
   */
  dispose(): void {
    if (this.animation !== null) {
      cancelAnimationFrame(this.animation.frame);
      this.animation.resolve();
      this.animation = null;
    }

    this.restoreRendererSettings();
    this.composer.dispose();
  }

  /**
   * Анимирует изменение порога эффекта затемнения.
   * @param {number} target Целевое значение порога.
   * @param {number} [duration=FX_ANIMATION_MS] Длительность анимации в миллисекундах.
   * @returns {Promise<void>} Промис, выполняющийся по завершении анимации.
   */
  private animateThreshold(
    target: number,
    duration: number = FX_ANIMATION_MS
  ): Promise<void> {
    const clampedTarget = clamp01(target);
    const threshold = this.uniforms.threshold;
    const from = threshold.value;

    if (this.animation !== null) {
      cancelAnimationFrame(this.animation.frame);
      this.animation.resolve();
      this.animation = null;
    }

    return new Promise<void>((resolve) => {
      const start = performance.now();
      const animation: ThresholdAnimation = {
        from,
        to: clampedTarget,
        start,
        duration,
        frame: 0,
        resolve,
      };

      const ease = (t: number): number =>
        t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;

      const step = (): void => {
        const now = performance.now();
        const elapsed = Math.min(1, (now - animation.start) / animation.duration);
        const eased = ease(elapsed);
        threshold.value = from + (animation.to - from) * eased;

        if (elapsed < 1) {
          animation.frame = requestAnimationFrame(step);
          return;
        }

        this.animation = null;
        resolve();
      };

      this.animation = animation;
      animation.frame = requestAnimationFrame(step);
    });
  }
}
