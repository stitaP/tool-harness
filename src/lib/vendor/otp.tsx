/* ─── stitaP — Custom OTP Input (replaces input-otp) ─── */

import React, { useRef, useState, useCallback } from "react";

export const InputOTP: React.FC<{
  maxLength: number;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}> = ({ maxLength, value: controlledValue, onChange, className }) => {
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback(
    (index: number, char: string) => {
      if (char.length > 1) char = char.slice(-1);
      const newValue = value.split("");
      newValue[index] = char;
      const result = newValue.join("").slice(0, maxLength);

      if (controlledValue === undefined) setInternalValue(result);
      onChange?.(result);

      if (char && index < maxLength - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, maxLength, controlledValue, onChange],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        const newValue = value.split("");
        newValue[index] = "";
        const result = newValue.join("");
        if (controlledValue === undefined) setInternalValue(result);
        onChange?.(result);
        if (index > 0) inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < maxLength - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, maxLength, controlledValue, onChange],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, maxLength);
      if (controlledValue === undefined) setInternalValue(pasted);
      onChange?.(pasted);
      const focusIndex = Math.min(pasted.length, maxLength - 1);
      inputRefs.current[focusIndex]?.focus();
    },
    [maxLength, controlledValue, onChange],
  );

  return React.createElement(
    "div",
    { className, style: { display: "flex", gap: "0.5rem" } },
    ...Array.from({ length: maxLength }, (_, i) =>
      React.createElement("input", {
        key: i,
        ref: (el: HTMLInputElement | null) => { inputRefs.current[i] = el; },
        type: "text",
        inputMode: "numeric",
        maxLength: 2,
        value: value[i] || "",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleChange(i, e.target.value.replace(/\D/g, "")),
        onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(i, e),
        onPaste: i === 0 ? handlePaste : undefined,
        style: {
          width: "2.5rem",
          height: "2.5rem",
          textAlign: "center",
          fontSize: "1.25rem",
          fontWeight: 600,
          border: "1px solid #3f3f46",
          borderRadius: "0.375rem",
          background: "transparent",
          color: "inherit",
          outline: "none",
        },
      }),
    ),
  );
};

export const InputOTPGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) =>
  React.createElement("div", { className, style: { display: "flex", gap: "0.5rem" } }, children);

export const InputOTPSlot: React.FC<{ index: number }> = () => null;
export const InputOTPSeparator: React.FC = () =>
  React.createElement("span", { style: { color: "#71717a", padding: "0 0.25rem" } }, "—");
