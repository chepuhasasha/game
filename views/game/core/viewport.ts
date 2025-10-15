import type { ExpoWebGLRenderingContext } from "expo-gl";
import type { Camera, OrthographicCamera, Scene, WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

import { Viewport as CoreViewport } from "../../../core";
import type { Extension, FX } from "./types";

type FXRegistry<TKey extends string = string> = Record<TKey, FX<unknown[]>>;

type ViewportInternals = CoreViewport & {
  renderer?: WebGLRenderer;
  scene?: Scene;
  camera?: OrthographicCamera;
  gl?: ExpoWebGLRenderingContext;
};

interface FXState {
  fxStore: Record<string, FX<unknown[]>>;
  composer: EffectComposer | null;
  renderPass: RenderPass | null;
  outputPass: OutputPass | null;
  originalRender: ((scene: Scene, camera: Camera) => void) | null;
}

export type ViewportWithFX<TFx extends FXRegistry = FXRegistry> = CoreViewport & {
  readonly fx: TFx;
  useFX<Name extends string, Effect extends FX<unknown[]>>(
    name: Name,
    fx: Effect
  ): ViewportWithFX<TFx & Record<Name, Effect>>;
};

const augmentedViewports = new WeakSet<CoreViewport>();
const fxStates = new WeakMap<CoreViewport, FXState>();

const getInternals = (viewport: CoreViewport): Required<ViewportInternals> => {
  const internals = viewport as ViewportInternals;
  if (!internals.renderer || !internals.scene || !internals.camera || !internals.gl) {
    throw new Error(
      "Вьюпорт должен быть инициализирован до подключения FX-расширения."
    );
  }
  return internals as Required<ViewportInternals>;
};

/**
 * Расширение, добавляющее поддержку пост-эффектов к игровому вьюпорту.
 */
export class ViewportFXExtension implements Extension<CoreViewport> {
  /**
   * Подключает расширение к переданному вьюпорту, добавляя методы работы с FX.
   * @param {CoreViewport} viewport Экземпляр базового вьюпорта.
   * @returns {void}
   */
  setup(viewport: CoreViewport): void {
    if (augmentedViewports.has(viewport)) {
      return;
    }

    const state: FXState = {
      fxStore: {},
      composer: null,
      renderPass: null,
      outputPass: null,
      originalRender: null,
    };

    fxStates.set(viewport, state);
    this.defineFXGetter(viewport);
    this.defineUseFX(viewport);

    augmentedViewports.add(viewport);
  }

  /**
   * Возвращает состояние FX для указанного вьюпорта.
   * @param {CoreViewport} viewport Вьюпорт, для которого требуется состояние.
   * @returns {FXState} Хранимое состояние FX.
   */
  private getState(viewport: CoreViewport): FXState {
    const state = fxStates.get(viewport);
    if (!state) {
      throw new Error("FX-состояние для данного вьюпорта не найдено.");
    }
    return state;
  }

  /**
   * Создаёт геттер для доступа к зарегистрированным эффектам.
   * @param {CoreViewport} viewport Вьюпорт, в который добавляется свойство.
   * @returns {void}
   */
  private defineFXGetter(viewport: CoreViewport): void {
    Object.defineProperty(viewport, "fx", {
      get: () => this.getState(viewport).fxStore,
    });
  }

  /**
   * Добавляет метод useFX для регистрации эффектов на вьюпорте.
   * @param {CoreViewport} viewport Вьюпорт, который нужно дополнить методом.
   * @returns {void}
   */
  private defineUseFX(viewport: CoreViewport): void {
    const extension = this;
    (viewport as ViewportWithFX).useFX = function useFX<Name extends string, Effect extends FX<unknown[]>>(
      this: ViewportWithFX,
      name: Name,
      fx: Effect
    ): ViewportWithFX {
      const state = extension.getState(this);
      extension.ensureComposer(this, state);
      extension.ensurePatchedRender(this, state);
      const internals = getInternals(this);
      const pass = fx.setup(
        internals.renderer,
        internals.scene,
        internals.camera,
        state.composer as EffectComposer
      );
      extension.insertPass(state, pass);
      fx.setSize(
        internals.gl.drawingBufferWidth,
        internals.gl.drawingBufferHeight
      );
      state.fxStore[name] = fx;
      return this as ViewportWithFX;
    } as ViewportWithFX["useFX"];
  }

  /**
   * Обеспечивает наличие общего композера пост-эффектов для вьюпорта.
   * @param {CoreViewport} viewport Вьюпорт, для которого создаётся композер.
   * @param {FXState} state Состояние, содержащее ссылки на эффекты.
   * @returns {void}
   */
  private ensureComposer(viewport: CoreViewport, state: FXState): void {
    if (state.composer) {
      return;
    }

    const internals = getInternals(viewport);
    const composer = new EffectComposer(internals.renderer);
    const renderPass = new RenderPass(internals.scene, internals.camera);
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(outputPass);
    composer.setSize(
      internals.gl.drawingBufferWidth,
      internals.gl.drawingBufferHeight
    );

    state.composer = composer;
    state.renderPass = renderPass;
    state.outputPass = outputPass;
  }

  /**
   * Переопределяет метод рендеринга, чтобы учитывать цепочку пост-эффектов.
   * @param {CoreViewport} viewport Вьюпорт, рендер которого необходимо расширить.
   * @param {FXState} state Состояние FX, содержащее ссылки на композер и эффекты.
   * @returns {void}
   */
  private ensurePatchedRender(viewport: CoreViewport, state: FXState): void {
    if (state.originalRender) {
      return;
    }

    const internals = getInternals(viewport);
    const renderer = internals.renderer;
    state.originalRender = renderer.render.bind(renderer);

    renderer.render = ((scene: Scene, camera: Camera) => {
      if (state.composer && state.renderPass) {
        state.renderPass.scene = scene;
        state.renderPass.camera = camera;
        Object.values(state.fxStore).forEach((fx) => fx.render());
        state.composer.render();
        return;
      }

      state.originalRender?.(scene, camera);
    }) as typeof renderer.render;
  }

  /**
   * Вставляет проход пост-обработки перед выходным проходом композера.
   * @param {FXState} state Состояние FX вьюпорта.
   * @param {Pass} pass Добавляемый проход пост-обработки.
   * @returns {void}
   */
  private insertPass(state: FXState, pass: Pass): void {
    if (!state.composer || !state.outputPass) {
      return;
    }

    const passes = state.composer.passes;
    const index = passes.indexOf(state.outputPass);

    if (index === -1) {
      state.composer.addPass(pass);
    } else {
      passes.splice(index, 0, pass);
    }
  }
}

const defaultExtension = new ViewportFXExtension();

/**
 * Применяет FX-расширение к существующему вьюпорту.
 * @param {CoreViewport} viewport Базовый вьюпорт, который требуется дополнить FX.
 * @param {ViewportFXExtension} [extension=defaultExtension] Экземпляр расширения FX.
 * @returns {ViewportWithFX} Вьюпорт с подключёнными возможностями FX.
 */
export const applyViewportFX = <TViewport extends CoreViewport>(
  viewport: TViewport,
  extension: ViewportFXExtension = defaultExtension
): ViewportWithFX => {
  extension.setup(viewport);
  return viewport as ViewportWithFX;
};

/**
 * Создаёт вьюпорт и сразу подключает к нему FX-расширение.
 * @param {ExpoWebGLRenderingContext} gl Контекст WebGL, предоставленный Expo.
 * @param {ViewportFXExtension} [extension=defaultExtension] Экземпляр расширения FX.
 * @returns {ViewportWithFX} Инициализированный вьюпорт с поддержкой пост-эффектов.
 */
export const createGameViewport = (
  gl: ExpoWebGLRenderingContext,
  extension: ViewportFXExtension = defaultExtension
): ViewportWithFX => {
  const viewport = new CoreViewport(gl);
  extension.setup(viewport);
  return viewport as ViewportWithFX;
};

export type { FXRegistry };
