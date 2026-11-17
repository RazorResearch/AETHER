import { create } from 'zustand';
import type { Toast, ToastTone } from '@/types';
import { createId } from '@/utils/cn';

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

/** Transient notifications. Never persisted, never sent anywhere. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, title, description) => {
    const id = createId('toast');
    set((state) => ({ toasts: [...state.toasts, { id, tone, title, description }].slice(-4) }));
    window.setTimeout(() => get().dismiss(id), 4800);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Convenience helpers so call sites stay terse. */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push('success', title, description),
  info: (title: string, description?: string) =>
    useToastStore.getState().push('info', title, description),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push('warning', title, description),
  error: (title: string, description?: string) =>
    useToastStore.getState().push('error', title, description),
};
