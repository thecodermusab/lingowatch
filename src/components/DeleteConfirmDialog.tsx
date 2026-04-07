import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isPending = false,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-[22rem] gap-0 overflow-hidden rounded-[1.6rem] border border-border bg-card p-0 text-left shadow-[0_22px_60px_rgba(0,0,0,0.22)]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-destructive/15 bg-destructive/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </div>
          <AlertDialogHeader className="space-y-2 text-left">
            <AlertDialogTitle className="text-[1.35rem] font-semibold tracking-tight text-foreground">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="max-w-[28ch] text-[0.95rem] leading-6 text-muted-foreground">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <AlertDialogFooter className="flex-row justify-end gap-2 border-t border-border/80 bg-secondary/12 px-5 py-4 sm:space-x-0">
          <AlertDialogCancel
            disabled={isPending}
            className="mt-0 h-10 rounded-full border-border/80 bg-transparent px-4 text-foreground hover:bg-secondary"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={onConfirm}
            className="h-10 rounded-full bg-destructive px-5 text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
