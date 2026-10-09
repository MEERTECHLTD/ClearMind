import React from 'react';
import { PageHeader, OfflineBanner, useBack } from './PageHeader';

/**
 * Header for screens opened from Browse (tools, settings): the shared
 * PageHeader with a back button by default (falls back to Browse when there's
 * no history) plus the offline banner. Pass onBack={null} to hide back.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | null;
  right?: React.ReactNode;
}) {
  const goBack = useBack();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} right={right} onBack={onBack === null ? null : onBack ?? goBack} />
      <OfflineBanner />
    </>
  );
}
