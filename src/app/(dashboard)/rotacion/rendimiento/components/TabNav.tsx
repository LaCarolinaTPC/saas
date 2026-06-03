"use client";

interface Tab {
  id: string;
  label: string;
}

export default function TabNav({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
            active === tab.id
              ? "bg-slate-900 text-white shadow-sm"
              : "text-text-secondary hover:bg-slate-100 hover:text-text-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
