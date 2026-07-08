"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

interface AnalyticsContextType {
  trackEvent: (eventName: string, eventData?: Record<string, any>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visitorId, setVisitorId] = useState<string>('');

  useEffect(() => {
    // Generate or retrieve visitor ID
    let storedId = localStorage.getItem('web3guard_visitor_id');
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('web3guard_visitor_id', storedId);
    }
    setVisitorId(storedId);

    // Track page view automatically
    trackEvent('page_view', { path: window.location.pathname }, storedId);
  }, []);

  const trackEvent = (eventName: string, eventData?: Record<string, any>, overrideVisitorId?: string) => {
    const id = overrideVisitorId || visitorId;
    if (!id) return;

    fetch('http://localhost:8000/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        visitor_id: id,
        event_name: eventName,
        event_data: eventData || {},
      }),
    }).catch(err => console.error('Failed to send analytics:', err));
  };

  return (
    <AnalyticsContext.Provider value={{ trackEvent }}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};
