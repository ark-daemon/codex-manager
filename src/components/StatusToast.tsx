import { X } from "lucide-react";
import { StatusMessage } from "../shared/types";

interface StatusToastProps {
  message: StatusMessage;
  onClose: () => void;
  closeLabel?: string;
}

export function StatusToast({ message, onClose, closeLabel = "Close message" }: StatusToastProps) {
  return (
    <div className={`toast-message ${message.kind}`} role="status">
      <span>{message.text}</span>
      <button className="toast-close" onClick={onClose} aria-label={closeLabel}>
        <X size={14} />
      </button>
    </div>
  );
}
