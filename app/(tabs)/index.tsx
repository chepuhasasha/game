import { StyleSheet, View } from "react-native";

import { RotatingCube } from "@/components/rotating-cube";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

/**
 * Главный экран приложения с вращающимся трёхмерным кубом.
 * @returns {JSX.Element} Возвращает разметку главного экрана.
 */
export default function HomeScreen(): JSX.Element {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Вращающийся куб
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Экран демонстрирует использование Three.js внутри Expo-приложения.
      </ThemedText>
      <View style={styles.cubeWrapper}>
        <RotatingCube />
      </View>
      <ThemedText style={styles.description}>
        Наблюдайте, как куб плавно вращается благодаря сочетанию Expo GLView и
        движка Three.js.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
  },
  cubeWrapper: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 340,
  },
  description: {
    textAlign: "center",
  },
});
