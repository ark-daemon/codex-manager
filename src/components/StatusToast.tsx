import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { StatusMessage } from "../shared/types";

interface StatusToastProps {
  message: StatusMessage;
  onClose: () => void;
  closeLabel?: string;
}

export function StatusToast({ message, onClose, closeLabel = "Close message" }: StatusToastProps) {
  const iconMap = {
    success: <CheckCircle2 size={16} className="toast-icon success-icon" />,
    error: <AlertCircle size={16} className="toast-icon error-icon" />,
    warning: <AlertTriangle size={16} className="toast-icon warning-icon" />,
    info: <Info size={16} className="toast-icon info-icon" />
  };

  return (
    <div className={`toast-message toast-floating ${message.kind}`} role="status">
      <div className="toast-content">
        {iconMap[message.kind] || iconMap.info}
        <span>{message.text}</span>
      </div>
      <button className="toast-close" onClick={onClose} aria-label={closeLabel}>
        <X size={14} />
      </button>
    </div>
  );
}
