import { StyleSheet, View } from "react-native";
import type { JSX } from "react";

import { ViewPort } from "@/components/viewport";

/**
 * Главный экран приложения с вращающимся трёхмерным кубом.
 * @returns {JSX.Element} Возвращает разметку главного экрана.
 */
export default function HomeScreen(): JSX.Element {
  return (
    <View style={styles.viewPortWrapper}>
      <ViewPort />
    </View>
  );
}

const styles = StyleSheet.create({
  viewPortWrapper: {
    height: "100%",
    width: "100%",
  },
});
