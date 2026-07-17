import type React from 'react';

type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  children?: React.ReactNode;
};

export default function PageHeader({
  title,
  eyebrow,
  description,
  children,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h2 className="page-title">{title}</h2>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="page-header-trailing">{children}</div>}
    </header>
  );
}
