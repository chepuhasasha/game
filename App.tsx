import type { JSX } from "react";

import { GameViewport } from "./src";

/**
 * Корневой компонент Expo-приложения, который отображает игровой вьюпорт.
 * @returns {JSX.Element} Возвращает компонент игрового экрана.
 */
export default function App(): JSX.Element {
  return <GameViewport />;
}