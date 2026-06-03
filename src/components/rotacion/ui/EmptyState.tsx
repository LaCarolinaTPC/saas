interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="py-12 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-bg flex items-center justify-center mb-4 text-text-muted">
        {icon}
      </div>
      <p className="text-sm font-medium text-text-tertiary">{title}</p>
      {description && (
        <p className="text-xs text-text-muted mt-1 max-w-xs">{description}</p>
      )}
    </div>
  );
}
