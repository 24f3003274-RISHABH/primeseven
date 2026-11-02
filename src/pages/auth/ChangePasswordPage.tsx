import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

export const ChangePasswordPage: React.FC = () => {
  const { profile, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const confirmEntered = confirmNewPassword.length > 0;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmNewPassword;
  const passwordsMismatch = confirmEntered && newPassword !== confirmNewPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!currentPassword) {
      setFeedback({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (newPassword.length < 6) {
      setFeedback({
        type: 'error',
        text: 'New password must be at least 6 characters long.',
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setFeedback({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (currentPassword === newPassword) {
      setFeedback({
        type: 'error',
        text: 'New password must be different from your current password.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword, confirmNewPassword);
      if (res.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setFeedback({
          type: 'success',
          text: 'Your password has been updated and your active session token has been rotated.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.error || 'Could not update password.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link
          to={profile?.role === 'admin' ? '/admin' : '/dashboard'}
          className="inline-flex items-center gap-1 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to {profile?.role === 'admin' ? 'Admin Console' : 'Dashboard'}</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">Account Security & Password</span>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-blue-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Change Password</h1>
            <p className="text-xs text-slate-500">
              Signed in as <span className="font-mono text-slate-700">{profile?.email}</span>
            </p>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-5 p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className={`w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border rounded-lg text-slate-900 focus:outline-none ${
                  passwordsMismatch
                    ? 'border-red-500 focus:border-red-600'
                    : passwordsMatch
                    ? 'border-emerald-500 focus:border-emerald-600'
                    : 'border-slate-200 focus:border-blue-600'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? 'Hide confirm new password' : 'Show confirm new password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordsMismatch && (
              <p className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>New passwords do not match.</span>
              </p>
            )}
            {passwordsMatch && (
              <p className="mt-1.5 text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>New passwords match.</span>
              </p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Salted Scrypt Hash · Automatic Session Rotation</span>
            </div>
            <button
              type="submit"
              disabled={submitting || passwordsMismatch}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
