"use client";

import { Button } from "@/components/ui/Button";

interface Props {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CascadeModal({ count, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-raised border border-border rounded-xl p-6 max-w-sm mx-4 w-full">
        <h2 className="font-semibold text-primary text-lg mb-2">Change pick?</h2>
        <p className="text-secondary text-sm mb-5">
          Changing this pick will clear {count} downstream pick
          {count !== 1 ? "s" : ""} that depended on it. Continue?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Yes, change it
          </Button>
        </div>
      </div>
    </div>
  );
}
