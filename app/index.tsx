import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { JSX } from "react";

import { ViewPort } from "@/components/viewport";
import { Game } from "@/views/game";

/**
 * Главный экран приложения со стартовым меню и трёхмерным вьюпортом.
 * @returns {JSX.Element} Возвращает разметку главного экрана.
 */
export default function HomeScreen(): JSX.Element {
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);
  const [isGameStarted, setIsGameStarted] = useState(false);

  /**
   * Переключает состояние звука между включённым и выключенным режимами.
   * @returns {void}
   */
  const handleToggleSound = useCallback((): void => {
    setIsSoundEnabled((prev) => !prev);
  }, []);

  /**
   * Переключает состояние вибрации между включённым и выключенным режимами.
   * @returns {void}
   */
  const handleToggleVibration = useCallback((): void => {
    setIsVibrationEnabled((prev) => !prev);
  }, []);

  /**
   * Запускает игру и скрывает стартовый экран.
   * @returns {void}
   */
  const handleStartGame = useCallback((): void => {
    setIsGameStarted(true);
  }, []);

  return (
    <View style={styles.container}>
      {isGameStarted ? (
        <View style={styles.viewPortWrapper}>
          <Game
            isSoundEnabled={isSoundEnabled}
            isVibrationEnabled={isVibrationEnabled}
          />
        </View>
      ) : (
        <View style={styles.startScreen}>
          <Text style={styles.title}>Добро пожаловать!</Text>
          <View style={styles.controlsContainer}>
            <Pressable
              onPress={handleToggleVibration}
              style={[
                styles.toggleButton,
                isVibrationEnabled ? styles.toggleButtonActive : null,
              ]}
            >
              <Text style={styles.toggleButtonText}>
                Вибрация: {isVibrationEnabled ? "Вкл" : "Выкл"}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleToggleSound}
              style={[
                styles.toggleButton,
                isSoundEnabled ? styles.toggleButtonActive : null,
              ]}
            >
              <Text style={styles.toggleButtonText}>
                Звук: {isSoundEnabled ? "Вкл" : "Выкл"}
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={handleStartGame} style={styles.startButton}>
            <Text style={styles.startButtonText}>Старт</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  viewPortWrapper: {
    flex: 1,
  },
  startScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingHorizontal: 32,
    backgroundColor: "#000000",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  controlsContainer: {
    width: "100%",
    gap: 16,
  },
  toggleButton: {
    borderWidth: 2,
    borderColor: "#000000",
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#0000",
  },
  toggleButtonActive: {
    borderColor: "#ffffff",
    backgroundColor: "#000000",
  },
  toggleButtonText: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  startButton: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    paddingHorizontal: 42,
    borderRadius: 4,
  },
  startButtonText: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
});