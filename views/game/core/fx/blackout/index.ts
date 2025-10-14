import { Camera, Scene, WebGLRenderer, NoBlending } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import fragmentShader from "./fragment.glsl";
import vertexShader from "./vertex.glsl";
import { FX } from "../../types";

export interface BlackoutFXOptions {
  strength: number;
  scale: number;
  threshold: number;
  edge: number;
}

export class BlackoutFX implements FX {
  composer: EffectComposer;
  renderPass: RenderPass;
  fxPass: ShaderPass;

  private animation: { raf: number; cancel: () => void } | null = null;
  outputPass: OutputPass;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    options: BlackoutFXOptions = {
      strength: 1.0,
      scale: 2.3,
      threshold: 0.0,
      edge: 0.0,
    }
  ) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.fxPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        strength: { value: options.strength },
        scale: { value: options.scale },
        threshold: { value: options.threshold },
        edge: { value: options.edge },
      },
      vertexShader,
      fragmentShader,
    });

    this.fxPass.material.toneMapped = false;
    this.fxPass.material.depthTest = false;
    this.fxPass.material.blending = NoBlending;
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.fxPass);
    this.composer.addPass(this.outputPass);

    this.disable();
  }
  enable() {
    this.fxPass.enabled = true;
  }
  disable() {
    this.fxPass.enabled = false;
  }
  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
  }
  render() {
    this.composer.render();
  }
  async play(mode: "hide" | "show", duration = 200): Promise<void> {
    if (mode === "hide") {
      this.setThreshold(1.0);
      await this.animateThreshold(0.0, duration);
    } else if (mode === "show") {
      this.setThreshold(0.0);
      await this.animateThreshold(1.0, duration);
    }
  }

  private setThreshold(value: number) {
    this.fxPass.uniforms.threshold.value = Math.min(1, Math.max(0, value));
  }

  private animateThreshold(to: number, ms = 200): Promise<void> {
    to = Math.min(1, Math.max(0, to));

    const u = this.fxPass.uniforms;
    const from = Number(u.threshold.value) || 0;

    if (ms <= 0 || Math.abs(to - from) < 1e-6) {
      this.setThreshold(to);
      if (this.animation) {
        this.animation.cancel();
      }
      return Promise.resolve();
    }

    if (this.animation) {
      this.animation.cancel();
    }

    const start = performance.now();
    const easeInOutQuad = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(1 - (2 * t - 1), 2) / 2;

    let raf = 0;
    let done!: () => void;

    const cancel = () => {
      if (raf) cancelAnimationFrame(raf);
      this.animation = null;
      done?.();
    };

    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const k = easeInOutQuad(t);
      this.setThreshold(from + (to - from) * k);

      if (t < 1) {
        raf = requestAnimationFrame(step);
        if (this.animation) this.animation.raf = raf;
      } else {
        this.animation = null;
        done();
      }
    };

    const p = new Promise<void>((resolve) => {
      done = resolve;
    });

    this.animation = { raf: 0, cancel };
    raf = requestAnimationFrame(step);
    this.animation.raf = raf;

    return p;
  }
}
