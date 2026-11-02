/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/layout/Navbar.tsx';
import { Footer } from './components/layout/Footer.tsx';
import { LandingPage } from './pages/public/LandingPage.tsx';
import { FreeTestsPage } from './pages/public/FreeTestsPage.tsx';
import { AuthPage } from './pages/auth/AuthPage.tsx';
import { SubjectsCataloguePage } from './pages/student/SubjectsCataloguePage.tsx';
import { SubjectDetailPage } from './pages/student/SubjectDetailPage.tsx';
import { IndividualTestCataloguePage } from './pages/student/IndividualTestCataloguePage.tsx';
import { SubjectPurchasePage } from './pages/student/SubjectPurchasePage.tsx';
import { TestInstructionsPage } from './pages/student/TestInstructionsPage.tsx';
import { ExaminationHallPage } from './pages/student/ExaminationHallPage.tsx';
import { ResultDetailPage } from './pages/student/ResultDetailPage.tsx';
import { MyResultsPage } from './pages/student/MyResultsPage.tsx';
import { StudentDashboardPage } from './pages/student/StudentDashboardPage.tsx';
import { MyPurchasesPage } from './pages/student/MyPurchasesPage.tsx';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage.tsx';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.tsx';

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  requireAdminRole?: boolean;
}> = ({ children, requireAdminRole = false }) => {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-xs font-mono text-slate-500">Verifying authentication session...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  if (requireAdminRole && profile.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
          <Navbar />
          <div className="flex-1">
            <Routes>
              {/* Public & Student Browsing Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
              <Route path="/free-tests" element={<FreeTestsPage />} />
              <Route path="/subjects" element={<SubjectsCataloguePage />} />
              <Route path="/subjects/:slug" element={<SubjectDetailPage />} />
              <Route path="/subjects/:slug/purchase" element={<SubjectPurchasePage />} />
              <Route path="/tests" element={<IndividualTestCataloguePage />} />
              <Route path="/tests/:testId/instructions" element={<TestInstructionsPage />} />

              {/* Authenticated Student Examination & Analytics Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <StudentDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/exam/:attemptId"
                element={
                  <ProtectedRoute>
                    <ExaminationHallPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/results"
                element={
                  <ProtectedRoute>
                    <MyResultsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/results/:attemptId"
                element={
                  <ProtectedRoute>
                    <ResultDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/purchases"
                element={
                  <ProtectedRoute>
                    <MyPurchasesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/change-password"
                element={
                  <ProtectedRoute>
                    <ChangePasswordPage />
                  </ProtectedRoute>
                }
              />

              {/* Role-Protected Administrator Console */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdminRole>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
