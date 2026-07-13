import React, { useState, useEffect } from "react";
import { copyForLanguage } from "../i18n";

type UiCopy = ReturnType<typeof copyForLanguage>;

export interface PromptModalConfig {
  open: boolean;
  title: string;
  description?: string;
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "password";
  helperText?: string;
  confirmText?: string;
  cancelText?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

interface PromptModalProps {
  config: PromptModalConfig | null;
  copy: UiCopy;
}

export function PromptModal({ config, copy }: PromptModalProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (config?.open) {
      setValue(config.defaultValue ?? "");
    }
  }, [config?.open, config?.defaultValue]);

  if (!config || !config.open) return null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (config) {
      void config.onSubmit(value);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={config.title}>
      <div className="modal-card">
        <h3>{config.title}</h3>
        {config.description && <p>{config.description}</p>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", margin: 0 }}>
          <label className="modal-field">
            {config.inputLabel && <span>{config.inputLabel}</span>}
            <input
              type={config.inputType ?? "text"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={config.placeholder}
              autoFocus
            />
            {config.helperText && <small className="modal-field-helper">{config.helperText}</small>}
          </label>
          <div className="modal-actions">
            <button type="submit">{config.confirmText ?? copy.actions.confirm}</button>
            <button type="button" onClick={config.onCancel} className="danger">
              {config.cancelText ?? copy.actions.cancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
