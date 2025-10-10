import { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { Renderer } from "expo-three";
import * as THREE from "three";

/**
 * Компонент, который отображает вращающийся трёхмерный куб на OpenGL-поверхности.
 * @returns {JSX.Element} Возвращает элемент интерфейса с 3D-сценой.
 */
export const RotatingCube = (): JSX.Element => {
  const animationFrameIdRef = useRef<number | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  /**
   * Обработчик создания контекста OpenGL, инициализирующий сцену Three.js и анимацию куба.
   * @param {ExpoWebGLRenderingContext} gl Контекст OpenGL, предоставленный Expo.
   * @returns {void}
   */
  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#05070d");

      const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
      const camera = new THREE.PerspectiveCamera(
        70,
        width / height,
        0.01,
        1000,
      );
      camera.position.z = 3;

      const renderer = new Renderer({ gl, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(1);
      rendererRef.current = renderer;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
      directionalLight.position.set(5, 5, 5);
      scene.add(directionalLight);

      const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
      const material = new THREE.MeshStandardMaterial({
        color: "#3b82f6",
        metalness: 0.2,
        roughness: 0.35,
      });
      const cube = new THREE.Mesh(geometry, material);
      scene.add(cube);

      /**
       * Функция, отвечающая за непрерывный рендеринг сцены и вращение куба.
       * @returns {void}
       */
      const animate = (): void => {
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.015;

        renderer.render(scene, camera);
        gl.endFrameEXP();

        animationFrameIdRef.current = requestAnimationFrame(animate);
      };

      animate();
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  return <GLView style={styles.glView} onContextCreate={handleContextCreate} />;
};

const styles = StyleSheet.create({
  glView: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
});
