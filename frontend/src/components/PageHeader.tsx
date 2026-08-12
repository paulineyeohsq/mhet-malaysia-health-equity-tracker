export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-line-grid bg-surface px-6 py-6 lg:px-10">
      <h1 className="text-2xl font-semibold text-ink-primary">{title}</h1>
      {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-secondary">{subtitle}</p>}
    </div>
  );
}
