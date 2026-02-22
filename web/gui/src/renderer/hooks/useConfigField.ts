import { useCallback } from "react";
import { useConfigStore, getByPath } from "@/store/configStore";

/**
 * Custom hook that binds a React form control to a specific config field.
 *
 * @typeParam T - The expected type of the field value.
 * @param path - Dot-notation path into the TrainConfig object
 *               (e.g. `"optimizer.learning_rate"`, `"text_encoder.train"`).
 * @returns A tuple `[value, setValue]` where:
 *   - `value` is the current field value (`undefined` when config is not yet loaded).
 *   - `setValue` is a stable callback that updates the field and triggers a
 *     debounced sync to the backend.
 *
 * @example
 * ```tsx
 * function LearningRateInput() {
 *   const [lr, setLr] = useConfigField<number>("learning_rate");
 *   return (
 *     <input
 *       type="number"
 *       value={lr ?? ""}
 *       onChange={(e) => setLr(parseFloat(e.target.value))}
 *     />
 *   );
 * }
 * ```
 */
export function useConfigField<T>(path: string): [T | undefined, (value: T) => void] {
  const value = useConfigStore((state) => {
    if (state.config === null) return undefined;
    return getByPath(state.config as unknown as Record<string, unknown>, path) as T | undefined;
  });

  const updateField = useConfigStore((state) => state.updateField);

  const setValue = useCallback(
    (newValue: T) => {
      updateField(path, newValue);
    },
    [updateField, path],
  );

  return [value, setValue];
}
