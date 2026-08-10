"use client";

type ComingSoonDialogProps = { onClose: () => void };

export function ComingSoonDialog({ onClose }: ComingSoonDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-5"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="coming-soon-title"
        className="w-full max-w-sm rounded-card bg-card p-6 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="coming-soon-title" className="text-h2 text-foreground">正在制作中</h2>
        <p className="mt-2 text-body text-muted">Coming soon</p>
        <button type="button" onClick={onClose} className="btn-primary mt-5 w-full">好的</button>
      </div>
    </div>
  );
}
