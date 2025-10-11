import { Stack } from "expo-router";
import type { JSX } from "react";

/**
 * Корневой макет приложения без стандартного заголовка навигации.
 * @returns {JSX.Element} Возвращает контейнер навигации стека без заголовка.
 */
export default function RootLayout(): JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
