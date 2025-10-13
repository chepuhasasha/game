import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { JSX } from "react";

import { ViewPort, type DifficultyOption } from "@/components/viewport";

const DIFFICULTIES: DifficultyOption[] = [
  {
    id: "easy",
    title: "Лёгкая",
    boxCountRange: [3, 4],
    matchThreshold: 0.85,
  },
  {
    id: "medium",
    title: "Средняя",
    boxCountRange: [5, 6],
    matchThreshold: 0.9,
  },
  {
    id: "hard",
    title: "Сложная",
    boxCountRange: [7, 8],
    matchThreshold: 0.93,
  },
];

/**
 * Главный экран приложения со стартовым меню и трёхмерным вьюпортом.
 * @returns {JSX.Element} Возвращает разметку главного экрана.
 */
export default function HomeScreen(): JSX.Element {
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<string>(
    DIFFICULTIES[1]?.id ?? DIFFICULTIES[0].id
  );

  const selectedDifficulty = useMemo((): DifficultyOption => {
    return (
      DIFFICULTIES.find((item) => item.id === selectedDifficultyId) ??
      DIFFICULTIES[0]
    );
  }, [selectedDifficultyId]);

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
   * Обрабатывает выбор уровня сложности пользователем.
   * @param {string} id Идентификатор сложности.
   * @returns {void}
   */
  const handleSelectDifficulty = useCallback((id: string): void => {
    setSelectedDifficultyId(id);
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
          <ViewPort
            isSoundEnabled={isSoundEnabled}
            isVibrationEnabled={isVibrationEnabled}
            difficulty={selectedDifficulty}
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
          <View style={styles.difficultyContainer}>
            <Text style={styles.sectionLabel}>Сложность</Text>
            <View style={styles.difficultyOptions}>
              {DIFFICULTIES.map((difficultyOption) => {
                const isActive =
                  difficultyOption.id === selectedDifficultyId;
                return (
                  <Pressable
                    key={difficultyOption.id}
                    onPress={() => handleSelectDifficulty(difficultyOption.id)}
                    style={[
                      styles.difficultyButton,
                      isActive ? styles.difficultyButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.difficultyButtonText,
                        isActive ? styles.difficultyButtonTextActive : null,
                      ]}
                    >
                      {difficultyOption.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.difficultyDescription}>
              Боксов: {selectedDifficulty.boxCountRange[0]}–
              {selectedDifficulty.boxCountRange[1]}, IoU ≥
              {selectedDifficulty.matchThreshold.toFixed(2)}
            </Text>
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
  sectionLabel: {
    color: "#cbd5f5",
    fontSize: 16,
    fontWeight: "600",
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
  difficultyContainer: {
    width: "100%",
    gap: 12,
  },
  difficultyOptions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  difficultyButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 6,
    backgroundColor: "#0f172a",
  },
  difficultyButtonActive: {
    borderColor: "#f8fafc",
    backgroundColor: "#1e293b",
  },
  difficultyButtonText: {
    color: "#cbd5f5",
    fontSize: 16,
    fontWeight: "500",
  },
  difficultyButtonTextActive: {
    color: "#f8fafc",
    fontWeight: "700",
  },
  difficultyDescription: {
    color: "#94a3b8",
    fontSize: 14,
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