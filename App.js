import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';

/**
 * @returns {React.JSX.Element} Главный экран приложения с 3D-кубом.
 */
export default function App() {
  const animationFrameId = useRef(null);
  const cubeRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);

  /**
   * @param {import('expo-gl').ExpoWebGLRenderingContext} gl Графический контекст GLView.
   * @param {number} width Ширина области рендеринга.
   * @param {number} height Высота области рендеринга.
   * @returns {void} Ничего не возвращает.
   */
  const initializeScene = useCallback((gl, width, height) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101020');

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 3;

    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: '#8ad0ff' });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const light = new THREE.DirectionalLight('#ffffff', 1);
    light.position.set(5, 5, 5);
    scene.add(light);

    cubeRef.current = cube;
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
  }, []);

  /**
   * @param {import('expo-gl').ExpoWebGLRenderingContext} gl Графический контекст GLView.
   * @returns {void} Ничего не возвращает.
   */
  const animate = useCallback((gl) => {
    const renderLoop = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !cubeRef.current) {
        return;
      }

      cubeRef.current.rotation.x += 0.01;
      cubeRef.current.rotation.y += 0.01;

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      gl.endFrameEXP();

      animationFrameId.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }, []);

  /**
   * @param {{ gl: import('expo-gl').ExpoWebGLRenderingContext; width: number; height: number }} params Параметры события создания контекста.
   * @returns {Promise<void>} Промис, который разрешается после настройки сцены.
   */
  const handleContextCreate = useCallback(
    async ({ gl, width, height }) => {
      initializeScene(gl, width, height);
      animate(gl);
    },
    [animate, initializeScene],
  );

  /**
   * @returns {void} Ничего не возвращает.
   */
  const handleContextDestroy = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    if (sceneRef.current) {
      sceneRef.current.clear();
      sceneRef.current = null;
    }

    cubeRef.current = null;
    cameraRef.current = null;
  }, []);

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={handleContextCreate}
        onContextDestroy={handleContextDestroy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050510',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glView: {
    width: '100%',
    height: '100%',
  },
});
