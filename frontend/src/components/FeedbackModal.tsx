"use client";

import React, { useState, useEffect } from 'react';
import { useAnalytics } from '@/contexts/AnalyticsContext';

export default function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [network, setNetwork] = useState('Testnet');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    // Check if user has already submitted feedback
    const submitted = localStorage.getItem('web3guard_feedback_submitted');
    if (submitted) {
      setHasSubmitted(true);
      return;
    }

    // Show popup after 30 seconds of being on the site
    const timer = setTimeout(() => {
      setIsOpen(true);
      trackEvent('feedback_modal_opened');
    }, 30000);

    return () => clearTimeout(timer);
  }, []);

  if (!isOpen || hasSubmitted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await fetch('http://localhost:8000/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network,
          feedback,
          additional_data: { source: 'popup' }
        }),
      });
      
      setHasSubmitted(true);
      setIsOpen(false);
      localStorage.setItem('web3guard_feedback_submitted', 'true');
      trackEvent('feedback_submitted', { network });
    } catch (err) {
      console.error(err);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-brutal-bg border-4 border-black w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="bg-brutal-yellow border-b-4 border-black p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold font-mono tracking-tight uppercase flex items-center gap-2">
            <span>We Value Your Feedback!</span>
          </h2>
          <button 
            onClick={() => {
              setIsOpen(false);
              trackEvent('feedback_modal_dismissed');
            }}
            className="text-black hover:text-red-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-gray-700 mb-6 font-mono">
            Help us improve Web3 Guard by sharing your experience.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            
            <div className="flex flex-col gap-2">
              <label className="font-bold text-sm uppercase tracking-wider">Are you using Testnet or Mainnet?</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-mono p-2 border-2 border-transparent hover:border-black transition-colors rounded">
                  <input 
                    type="radio" 
                    name="network" 
                    value="Testnet" 
                    checked={network === 'Testnet'}
                    onChange={(e) => setNetwork(e.target.value)}
                    className="w-4 h-4 accent-brutal-orange"
                  />
                  Testnet
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-mono p-2 border-2 border-transparent hover:border-black transition-colors rounded">
                  <input 
                    type="radio" 
                    name="network" 
                    value="Mainnet" 
                    checked={network === 'Mainnet'}
                    onChange={(e) => setNetwork(e.target.value)}
                    className="w-4 h-4 accent-brutal-orange"
                  />
                  Mainnet
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="feedback" className="font-bold text-sm uppercase tracking-wider">Your Feedback</label>
              <textarea 
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                required
                rows={4}
                placeholder="What do you think? Any features you'd like to see?"
                className="p-3 border-2 border-black focus:outline-none focus:ring-2 focus:ring-brutal-orange font-mono text-sm resize-none"
              />
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="mt-2 bg-black text-white p-3 font-bold font-mono uppercase tracking-wider hover:bg-brutal-orange transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Submitting...
                </>
              ) : (
                'Submit Feedback'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
