import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}

export default function PageFrame({ title, eyebrow, description, icon: Icon, actions, children }: Props) {
  return (
    <div className="page-frame">
      <header className="page-heading">
        <div className="page-heading-copy"><div className="page-eyebrow"><Icon className="w-3.5 h-3.5" /> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
        {actions && <div className="page-heading-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}