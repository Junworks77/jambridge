import { type ReactNode, useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import "./collapsible-panel.css";

export default function CollapsiblePanel({
  title,
  className,
  header,
  children,
  as: Tag = "section",
}: {
  title: string;
  className: string;
  header: ReactNode;
  children: ReactNode;
  as?: "section" | "aside";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  const label = `${title} ${collapsed ? "펼치기" : "숨기기"}`;
  return (
    <Tag
      id={id}
      className={`${className} collapsible-panel ${collapsed ? "is-collapsed" : ""}`}
    >
      <div className="panel-heading">
        {header}
        <button
          type="button"
          className="icon-button panel-collapse-toggle"
          aria-label={label}
          title={label}
          aria-expanded={!collapsed}
          aria-controls={id}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>
      {children}
    </Tag>
  );
}
